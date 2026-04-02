import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  processTradeExit,
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
  type AllExchangePrices,
} from "@/lib/exchanges";

export const dynamic = "force-dynamic";

/**
 * POST /api/sim/force-close
 * Body: { simTradeId: string }
 * Auth: Firebase ID token in Authorization header
 *
 * Closes a simulator trade at current market price and cascades
 * the close to any linked live trade on the exchange.
 */
export async function POST(request: NextRequest) {
  // Auth
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
  if (simTrade.status !== "OPEN") {
    return NextResponse.json({ error: "Trade already closed" }, { status: 400 });
  }

  // 2. Get current price
  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), DHAN: new Map() };
  if (priceDoc.exists) {
    allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
  }
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
  });

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

  // 4. Cascade to linked live trades
  let liveClosed = 0;
  let liveErrors: string[] = [];

  const liveSnap = await db.collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  for (const liveDoc of liveSnap.docs) {
    const lt = { id: liveDoc.id, ...liveDoc.data() } as LiveTrade;
    try {
      // Find user credentials
      const userId = lt.userId;
      const ltExchange = lt.exchange;
      const docIds = getSecretDocIds(ltExchange);
      let creds: Credentials | null = null;

      for (const secretId of docIds) {
        try {
          const secretDoc = await db.collection("users").doc(userId)
            .collection("secrets").doc(secretId).get();
          if (secretDoc.exists && secretDoc.data()?.autoTradeEnabled === true) {
            const data = secretDoc.data()!;
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

      const livePrice = getPrice(allPrices, lt.signalSymbol, ltExchange) ?? currentPrice;
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
        });
        liveClosed++;
      } else if (closeResult.warning) {
        liveErrors.push(`${lt.signalSymbol}: ${closeResult.warning}`);
      }
    } catch (err) {
      liveErrors.push(`${lt.signalSymbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    success: true,
    simTrade: {
      id: simTradeId,
      symbol: simTrade.symbol,
      side: simTrade.side,
      closePrice: currentPrice,
      pnl: netPnl,
    },
    liveClosed,
    liveErrors: liveErrors.length > 0 ? liveErrors : undefined,
  });
}
