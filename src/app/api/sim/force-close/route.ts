import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
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
  /** Total live mirrors found OPEN at the start of the cascade. */
  liveAttempted: number;
  /** Distinct user IDs touched by the cascade (closed OR attempted). */
  userCount: number;
  /** Distinct user IDs (for callers that aggregate across multiple
   *  force-close POSTs and need to dedupe). */
  userIds: string[];
  /** Per-exchange close counts (only successful closes). */
  byExchange: Record<string, number>;
}

/**
 * Closes every OPEN live_trades doc linked to this sim trade via
 * `simTradeId`, using `protectiveClose` (the same path sync-live-trades
 * uses for sim-driven closes). Returns counts + per-mirror errors and
 * per-exchange / per-user aggregates so the kill-switch UI can show a
 * detailed success toast. Never throws — failures roll up into
 * `liveErrors`.
 *
 * Shared between two call sites in the same endpoint:
 *   • the standard "close OPEN sim + cascade" path
 *   • the "live-only" recovery path for an already-closed sim whose
 *     original inline cascade failed
 */
async function cascadeCloseLiveMirrors(
  db: Firestore,
  simTradeId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<CascadeResult> {
  let liveClosed = 0;
  const liveErrors: string[] = [];
  const byExchange: Record<string, number> = {};
  const userIds = new Set<string>();

  const liveSnap = await db.collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  const liveAttempted = liveSnap.docs.length;

  for (const liveDoc of liveSnap.docs) {
    const lt = { id: liveDoc.id, ...liveDoc.data() } as LiveTrade;
    if (lt.userId) userIds.add(lt.userId);
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
        byExchange[lt.exchange] = (byExchange[lt.exchange] ?? 0) + 1;
      } else if (closeResult.warning) {
        liveErrors.push(`${lt.signalSymbol} [${lt.exchange}]: ${closeResult.warning}`);
      } else {
        liveErrors.push(`${lt.signalSymbol} [${lt.exchange}]: close did not fill`);
      }
    } catch (err) {
      liveErrors.push(`${lt.signalSymbol} [${lt.exchange}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    liveClosed,
    liveErrors,
    liveAttempted,
    userCount: userIds.size,
    userIds: Array.from(userIds),
    byExchange,
  };
}

async function loadAllPrices(db: Firestore): Promise<AllExchangePrices> {
  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  if (!priceDoc.exists) {
    return { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), COINDCX: new Map(), HYPERLIQUID: new Map(), DHAN: new Map() };
  }
  return deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
}

/**
 * GET /api/sim/force-close?simTradeId=...
 * Auth: admin only.
 *
 * Read-only preflight. Returns the blast-radius the caller would inflict
 * if they POSTed to this endpoint with the same `simTradeId`:
 *   • sim trade summary (status, symbol, side, current price)
 *   • every linked live mirror (id, userId, exchange, side, qty, status)
 *   • aggregate counts: mirrors total, distinct users, breakdown by
 *     exchange
 *
 * Never writes. Never closes anything. Lets the kill-switch dialog show
 * "you are about to close X positions for Y users" before the operator
 * is asked to type the safety phrase.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const simTradeId = searchParams.get("simTradeId");
  if (!simTradeId || typeof simTradeId !== "string") {
    return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
  if (!simDoc.exists) {
    return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
  }
  const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

  const liveSnap = await db
    .collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  type MirrorRow = {
    id: string;
    userId: string;
    exchange: string;
    side: string;
    qty: number;
    status: string;
  };
  const liveMirrors: MirrorRow[] = liveSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      userId: String(data.userId ?? ""),
      exchange: String(data.exchange ?? ""),
      side: String(data.side ?? ""),
      qty: Number(data.positionSize ?? data.quantity ?? 0),
      status: String(data.status ?? "OPEN"),
    };
  });

  const userIds = new Set(liveMirrors.map((m) => m.userId).filter(Boolean));
  const byExchange: Record<string, number> = {};
  for (const m of liveMirrors) {
    byExchange[m.exchange] = (byExchange[m.exchange] ?? 0) + 1;
  }

  return NextResponse.json({
    simTrade: {
      id: simTrade.id,
      symbol: simTrade.symbol,
      side: simTrade.side,
      status: simTrade.status,
      currentPrice: simTrade.currentPrice ?? simTrade.entryPrice,
      entryPrice: simTrade.entryPrice,
    },
    liveMirrors,
    summary: {
      liveMirrorCount: liveMirrors.length,
      userCount: userIds.size,
      byExchange,
    },
  });
}

/**
 * POST /api/sim/force-close
 * Body: { simTradeId: string }
 * Auth: admin only (Firebase ID token + admin_user_roles membership).
 *
 * Two behaviours, picked from the sim trade's current state:
 *
 *   • Sim is OPEN → close the sim at market + cascade live mirrors.
 *
 *   • Sim is CLOSED but still has OPEN linked live_trades → "live-only"
 *     recovery cascade. Sim doc is NOT touched. Returns the same
 *     `{ liveClosed, liveErrors }` shape so the caller can show a
 *     toast and retry until clean.
 *
 *   • Sim is CLOSED with zero open mirrors → 400 (nothing to do).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  // Branch A — sim already CLOSED → "live-only" cascade.
  if (simTrade.status !== "OPEN") {

    const allPricesAdmin = await loadAllPrices(db);
    const exchangeAdmin = (simTrade as any).exchange ?? "BINANCE";
    const fallbackPriceAdmin =
      getPrice(allPricesAdmin, simTrade.symbol, exchangeAdmin)
      ?? simTrade.currentPrice
      ?? simTrade.entryPrice;

    const recovery = await cascadeCloseLiveMirrors(db, simTradeId, fallbackPriceAdmin, allPricesAdmin);

    // P2 fix: "sim closed + zero open mirrors" is a no-op success, not an
    // error. Caller should see a benign "nothing to do" toast rather than
    // a destructive "Force close failed" banner. Returning 200 with
    // `liveAttempted: 0` keeps the success branch unified.
    if (recovery.liveAttempted === 0) {
      return NextResponse.json({
        success: true,
        mode: "live-only",
        noop: true,
        simTrade: {
          id: simTradeId,
          symbol: simTrade.symbol,
          side: simTrade.side,
        },
        liveAttempted: 0,
        liveClosed: 0,
        userCount: 0,
        userIds: [],
        byExchange: {},
        message: "Sim is already closed and all mirrors are reconciled.",
      });
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
      liveAttempted: recovery.liveAttempted,
      liveClosed: recovery.liveClosed,
      userCount: recovery.userCount,
      userIds: recovery.userIds,
      byExchange: recovery.byExchange,
      liveErrors: recovery.liveErrors.length > 0 ? recovery.liveErrors : undefined,
    });
  }

  // Branch B — sim still OPEN → standard close + cascade.

  // 2. Get current price (read outside the txn — no concurrent writer)
  const allPrices = await loadAllPrices(db);
  const exchange = (simTrade as any).exchange ?? "BINANCE";
  const currentPrice =
    getPrice(allPrices, simTrade.symbol, exchange) ??
    simTrade.currentPrice ??
    simTrade.entryPrice;
  const assetType = (simTrade as any).assetType ?? "CRYPTO";
  const stateDocId = getSimStateDocId(assetType);
  const simRef = db.collection("simulator_trades").doc(simTradeId);
  const stateRef = db.collection("config").doc(stateDocId);

  // 3. Atomic close (P0 fix): wrap the sim status flip + capital + win/loss
  //    update in a single Firestore transaction. Two concurrent POSTs that
  //    both see the sim as OPEN would otherwise double-debit capital and
  //    append duplicate KILL_SWITCH events. The txn forces the second caller
  //    to re-read inside the txn, find status === "CLOSED", and bail out
  //    without writing.
  //
  //    Idempotency: if the txn discovers the sim is already CLOSED (lost the
  //    race), we fall through to the live-only cascade path so the caller
  //    still gets the orphaned-mirror sweep. This matches branch A's
  //    contract.
  type TxResult =
    | {
        flipped: true;
        netPnl: number;
        newCapital: number;
        currentPrice: number;
      }
    | { flipped: false; reason: "ALREADY_CLOSED" | "DELETED" };

  const txResult: TxResult = await db.runTransaction(async (tx) => {
    const freshSim = await tx.get(simRef);
    if (!freshSim.exists) {
      return { flipped: false as const, reason: "DELETED" as const };
    }
    const fresh = freshSim.data() as SimTrade;
    if (fresh.status !== "OPEN") {
      return { flipped: false as const, reason: "ALREADY_CLOSED" as const };
    }

    const freshStateSnap = await tx.get(stateRef);
    const freshState: SimulatorState = freshStateSnap.exists
      ? checkDailyReset(freshStateSnap.data() as SimulatorState)
      : createInitialState(assetType);

    const txUnrealized = computeUnrealizedPnl(fresh, currentPrice);
    const txExitFee =
      fresh.positionSize * fresh.remainingPct * SIM_CONFIG.EXCHANGE_FEE;
    const txNetPnl = txUnrealized - txExitFee;
    const txTotalRealized = fresh.realizedPnl + txNetPnl;

    const txCloseEvent = {
      type: "KILL_SWITCH" as const,
      price: currentPrice,
      pnl: txNetPnl,
      fee: txExitFee,
      closePct: fresh.remainingPct,
      timestamp: new Date().toISOString(),
    };

    // Snapshot the most-recent live score the sync-simulator cron stamped
    // on the open trade so the History view can show "Entry → Close" delta
    // and the Score-vs-Outcome analysis has data for force-closed trades.
    // Conditional copy to avoid writing `undefined` into Firestore.
    const txScoreUpdate: Record<string, unknown> = {};
    if (fresh.currentScore != null) {
      txScoreUpdate.confidenceScoreAtClose = fresh.currentScore;
    }
    if (fresh.currentScorePattern) {
      txScoreUpdate.scorePatternAtClose = fresh.currentScorePattern;
    }

    tx.update(simRef, {
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      closeReason: "KILL_SWITCH",
      currentPrice,
      unrealizedPnl: 0,
      remainingPct: 0,
      realizedPnl: txTotalRealized,
      fees: fresh.fees + txExitFee,
      events: [...(fresh.events || []), txCloseEvent],
      ...txScoreUpdate,
    });

    const txNewCapital = freshState.capital + txNetPnl;
    const txStateUpdate: Record<string, unknown> = {
      capital: txNewCapital,
      dailyPnl: (freshState.dailyPnl ?? 0) + txNetPnl,
      totalFeesPaid: (freshState.totalFeesPaid ?? 0) + txExitFee,
      lastUpdated: new Date().toISOString(),
    };
    if (txTotalRealized >= 0) {
      txStateUpdate.totalWins = (freshState.totalWins ?? 0) + 1;
    } else {
      txStateUpdate.totalLosses = (freshState.totalLosses ?? 0) + 1;
    }
    if (freshStateSnap.exists) {
      tx.update(stateRef, txStateUpdate);
    } else {
      tx.set(stateRef, { ...freshState, ...txStateUpdate });
    }

    return {
      flipped: true as const,
      netPnl: txNetPnl,
      newCapital: txNewCapital,
      currentPrice,
    };
  });

  if (!txResult.flipped && txResult.reason === "DELETED") {
    return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
  }

  // Lost the race — another concurrent kill-switch flipped the sim while
  // we were mid-flight. Fall through to the live-only cascade so the
  // caller still gets the orphaned-mirror sweep (matches branch A's
  // contract). Sim doc state is NOT touched a second time.
  if (!txResult.flipped) {
    const recovery = await cascadeCloseLiveMirrors(db, simTradeId, currentPrice, allPrices);
    return NextResponse.json({
      success: true,
      mode: "live-only",
      raced: true,
      simTrade: {
        id: simTradeId,
        symbol: simTrade.symbol,
        side: simTrade.side,
      },
      liveAttempted: recovery.liveAttempted,
      liveClosed: recovery.liveClosed,
      userCount: recovery.userCount,
      userIds: recovery.userIds,
      byExchange: recovery.byExchange,
      liveErrors: recovery.liveErrors.length > 0 ? recovery.liveErrors : undefined,
    });
  }

  // 4. Queue blockchain publication (best-effort; failures are non-fatal
  //    because the sim is already correctly closed).
  await markTradeForBlockchain(db, simTradeId).catch((e) => {
    console.error("[force-close] blockchain publish queue failed:", e);
  });

  // 5. Audit log — written outside the txn so a log failure doesn't roll
  //    back the close. Logging is best-effort.
  await db
    .collection("simulator_logs")
    .add({
      timestamp: new Date().toISOString(),
      action: "KILL_SWITCH",
      details: `${simTrade.symbol} ${simTrade.side} force-closed @ ${txResult.currentPrice} | PnL: ${txResult.netPnl.toFixed(4)}`,
      signalId: simTrade.signalId,
      symbol: simTrade.symbol,
      capital: txResult.newCapital,
      pnl: txResult.netPnl,
      assetType,
    })
    .catch((e) => {
      console.error("[force-close] simulator_logs write failed:", e);
    });

  // 6. Cascade to linked live trades (shared helper — same logic the
  //    "live-only" recovery branch uses).
  const cascade = await cascadeCloseLiveMirrors(
    db,
    simTradeId,
    txResult.currentPrice,
    allPrices,
  );

  return NextResponse.json({
    success: true,
    mode: "default",
    simTrade: {
      id: simTradeId,
      symbol: simTrade.symbol,
      side: simTrade.side,
      closePrice: txResult.currentPrice,
      pnl: txResult.netPnl,
    },
    liveAttempted: cascade.liveAttempted,
    liveClosed: cascade.liveClosed,
    userCount: cascade.userCount,
    userIds: cascade.userIds,
    byExchange: cascade.byExchange,
    liveErrors: cascade.liveErrors.length > 0 ? cascade.liveErrors : undefined,
  });
}
