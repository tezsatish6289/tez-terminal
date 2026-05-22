import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  type SimTrade,
  type SimulatorState,
  checkDailyReset,
  createInitialState,
  getSimStateDocId,
  computeUnrealizedPnl,
  SIM_CONFIG,
} from "@/lib/simulator";
import {
  protectiveClose,
  type LiveTrade,
  type Credentials,
} from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";
import {
  getPrice,
  deserializePrices,
  getSecretDocIds,
  docMatchesExchange,
  type AllExchangePrices,
  type ExchangeName,
} from "@/lib/exchanges";
import { markTradeForBlockchain } from "@/lib/blockchain-logger";

export const dynamic = "force-dynamic";

interface CascadeResult {
  liveClosed: number;
  liveErrors: string[];
}

/**
 * Closes every OPEN live_trades doc linked to this sim trade via
 * `simTradeId`, using `protectiveClose` (the same path sync-live-trades
 * uses for sim-driven closes). Returns the count closed and any per-mirror
 * errors. Never throws — failures roll up into `liveErrors`.
 *
 * Shared between two call sites in the same endpoint:
 *   • the standard "close OPEN sim + cascade" path
 *   • the "live-only" recovery path for an already-closed sim whose
 *     original inline cascade failed (admin-gated)
 */
async function cascadeCloseLiveMirrors(
  db: Firestore,
  simTradeId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<CascadeResult> {
  let liveClosed = 0;
  const liveErrors: string[] = [];

  const liveSnap = await db.collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  for (const liveDoc of liveSnap.docs) {
    const lt = { id: liveDoc.id, ...liveDoc.data() } as LiveTrade;
    try {
      const userId = lt.userId;
      const ltExchange = lt.exchange;
      const docIds = getSecretDocIds(ltExchange);
      let creds: Credentials | null = null;

      for (const secretId of docIds) {
        try {
          const secretDoc = await db.collection("users").doc(userId)
            .collection("secrets").doc(secretId).get();
          const data = secretDoc.data();
          if (
            secretDoc.exists &&
            data &&
            docMatchesExchange(data, ltExchange as ExchangeName, secretId)
          ) {
            creds = {
              apiKey: decrypt(data.encryptedKey),
              apiSecret: decrypt(data.encryptedSecret),
              testnet: data.useTestnet === true,
            };
            break;
          }
        } catch {}
      }

      if (!creds) {
        liveErrors.push(`${lt.signalSymbol}: no credentials found`);
        continue;
      }

      const livePrice = getPrice(allPrices, lt.signalSymbol, ltExchange) ?? fallbackPrice;
      const closeResult = await protectiveClose(lt, "KILL_SWITCH", livePrice, creds);

      if (closeResult.updatedFields.status === "CLOSED") {
        await db.collection("live_trades").doc(liveDoc.id).update({
          ...closeResult.updatedFields,
          events: [...(lt.events || []), closeResult.newEvent],
        });
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "KILL_SWITCH",
          details: `${lt.signalSymbol} ${lt.side} force-closed @ $${livePrice} (sim cascade)`,
          symbol: lt.signalSymbol,
          userId,
          exchange: ltExchange,
          assetType: ltExchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
        });
        liveClosed++;
      } else if (closeResult.warning) {
        liveErrors.push(`${lt.signalSymbol}: ${closeResult.warning}`);
      } else {
        liveErrors.push(`${lt.signalSymbol}: close did not fill`);
      }
    } catch (err) {
      liveErrors.push(`${lt.signalSymbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { liveClosed, liveErrors };
}

async function loadAllPrices(db: Firestore): Promise<AllExchangePrices> {
  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  if (!priceDoc.exists) {
    return { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), COINDCX: new Map(), HYPERLIQUID: new Map(), DHAN: new Map() };
  }
  return deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
}

/**
 * POST /api/sim/force-close
 * Body: { simTradeId: string }
 * Auth: Firebase ID token in Authorization header
 *
 * Two behaviours, picked from the sim trade's current state:
 *
 *   • Sim is OPEN → close the sim at market + cascade live mirrors.
 *     Any signed-in user can trigger this (existing behaviour).
 *
 *   • Sim is CLOSED but still has OPEN linked live_trades → admin-only
 *     "live-only" recovery cascade. Sim doc is NOT touched. Returns the
 *     same `{ liveClosed, liveErrors }` shape so the caller can show a
 *     toast and retry until clean.
 *
 *   • Sim is CLOSED with zero open mirrors → 400 (nothing to do).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await getAdminAuth().verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { simTradeId } = await request.json();
  if (!simTradeId || typeof simTradeId !== "string") {
    return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
  }

  const db = getAdminFirestore();

  // 1. Load sim trade
  const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
  if (!simDoc.exists) {
    return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
  }
  const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

  // Branch A — sim already CLOSED → admin-only "live-only" cascade.
  if (simTrade.status !== "OPEN") {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const allPricesAdmin = await loadAllPrices(db);
    const exchangeAdmin = (simTrade as any).exchange ?? "BINANCE";
    const fallbackPriceAdmin =
      getPrice(allPricesAdmin, simTrade.symbol, exchangeAdmin)
      ?? simTrade.currentPrice
      ?? simTrade.entryPrice;

    const recovery = await cascadeCloseLiveMirrors(db, simTradeId, fallbackPriceAdmin, allPricesAdmin);

    if (recovery.liveClosed === 0 && recovery.liveErrors.length === 0) {
      return NextResponse.json({
        error: "No open live mirrors to close — sim is already closed and all mirrors are reconciled.",
      }, { status: 400 });
    }

    await db.collection("simulator_logs").add({
      timestamp: new Date().toISOString(),
      action: "KILL_SWITCH_LIVE_RECOVERY",
      details: `${simTrade.symbol} ${simTrade.side}: live-only recovery cascade — closed ${recovery.liveClosed}, errors ${recovery.liveErrors.length}`,
      signalId: simTrade.signalId,
      symbol: simTrade.symbol,
      capital: null,
      pnl: null,
      assetType: (simTrade as any).assetType ?? "CRYPTO",
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      mode: "live-only",
      simTrade: {
        id: simTradeId,
        symbol: simTrade.symbol,
        side: simTrade.side,
      },
      liveClosed: recovery.liveClosed,
      liveErrors: recovery.liveErrors.length > 0 ? recovery.liveErrors : undefined,
    });
  }

  // Branch B — sim still OPEN → standard close + cascade (existing behaviour).

  // 2. Get current price
  const allPrices = await loadAllPrices(db);
  const exchange = (simTrade as any).exchange ?? "BINANCE";
  const currentPrice = getPrice(allPrices, simTrade.symbol, exchange) ?? simTrade.currentPrice ?? simTrade.entryPrice;

  // 3. Close sim trade
  const assetType = (simTrade as any).assetType ?? "CRYPTO";
  const stateDocId = getSimStateDocId(assetType);
  const stateDoc = await db.collection("config").doc(stateDocId).get();
  const simState: SimulatorState = stateDoc.exists
    ? checkDailyReset(stateDoc.data() as SimulatorState)
    : createInitialState(assetType);

  const unrealizedPnl = computeUnrealizedPnl(simTrade, currentPrice);
  const exitFee = simTrade.positionSize * simTrade.remainingPct * SIM_CONFIG.EXCHANGE_FEE;
  const netPnl = unrealizedPnl - exitFee;

  const closeEvent = {
    type: "KILL_SWITCH" as const,
    price: currentPrice,
    pnl: netPnl,
    fee: exitFee,
    closePct: simTrade.remainingPct,
    timestamp: new Date().toISOString(),
  };

  const totalRealizedPnl = simTrade.realizedPnl + netPnl;

  // Snapshot the most-recent live score the sync-simulator cron stamped on
  // the open trade so the History view can show "Entry → Close" delta and
  // the Score-vs-Outcome analysis has data for force-closed trades. Fields
  // are copied conditionally to avoid writing `undefined` into Firestore.
  const closeScoreUpdate: Record<string, unknown> = {};
  if (simTrade.currentScore != null) {
    closeScoreUpdate.confidenceScoreAtClose = simTrade.currentScore;
  }
  if (simTrade.currentScorePattern) {
    closeScoreUpdate.scorePatternAtClose = simTrade.currentScorePattern;
  }

  await db.collection("simulator_trades").doc(simTradeId).update({
    status: "CLOSED",
    closedAt: new Date().toISOString(),
    closeReason: "KILL_SWITCH",
    currentPrice,
    unrealizedPnl: 0,
    remainingPct: 0,
    realizedPnl: totalRealizedPnl,
    fees: simTrade.fees + exitFee,
    events: [...(simTrade.events || []), closeEvent],
    ...closeScoreUpdate,
  });

  // Queue this closed trade for blockchain publication (fire-and-forget)
  await markTradeForBlockchain(db, simTradeId);

  // Update sim state capital (netPnl already includes fee deduction)
  const newCapital = simState.capital + netPnl;
  const stateUpdate: Record<string, unknown> = {
    capital: newCapital,
    dailyPnl: (simState.dailyPnl ?? 0) + netPnl,
    totalFeesPaid: (simState.totalFeesPaid ?? 0) + exitFee,
    lastUpdated: new Date().toISOString(),
  };
  if (totalRealizedPnl >= 0) {
    stateUpdate.totalWins = (simState.totalWins ?? 0) + 1;
  } else {
    stateUpdate.totalLosses = (simState.totalLosses ?? 0) + 1;
  }
  await db.collection("config").doc(stateDocId).update(stateUpdate);

  await db.collection("simulator_logs").add({
    timestamp: new Date().toISOString(),
    action: "KILL_SWITCH",
    details: `${simTrade.symbol} ${simTrade.side} force-closed @ ${currentPrice} | PnL: ${netPnl.toFixed(4)}`,
    signalId: simTrade.signalId,
    symbol: simTrade.symbol,
    capital: newCapital,
    pnl: netPnl,
    assetType,
  });

  // 4. Cascade to linked live trades (shared helper — same logic the
  // "live-only" recovery branch uses).
  const cascade = await cascadeCloseLiveMirrors(db, simTradeId, currentPrice, allPrices);

  return NextResponse.json({
    success: true,
    mode: "default",
    simTrade: {
      id: simTradeId,
      symbol: simTrade.symbol,
      side: simTrade.side,
      closePrice: currentPrice,
      pnl: netPnl,
    },
    liveClosed: cascade.liveClosed,
    liveErrors: cascade.liveErrors.length > 0 ? cascade.liveErrors : undefined,
  });
}
