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
import { markTradeForBlockchain } from "@/lib/blockchain-logger";
import { getPrice, type BrokerName } from "@/lib/exchanges";
import { killSwitchExitPrice } from "@/lib/entry-price-sanity";
import { loadZoneBotState, saveZoneBotState } from "@/lib/zone-bot-state";
import { ZONE_BOT_REGISTRY } from "@/lib/zone-bot-config";
import {
  cascadeCloseLiveMirrors,
  loadAllExchangePrices,
  type CascadeResult,
} from "@/lib/admin/cascade-close-live-mirrors";

export type ForceCloseMode = "default" | "live-only";

export interface ForceCloseSimTradeResult {
  success: boolean;
  mode: ForceCloseMode;
  noop?: boolean;
  raced?: boolean;
  simTrade: {
    id: string;
    symbol: string;
    side: string;
    status?: string;
    closePrice?: number;
    pnl?: number;
  };
  liveAttempted: number;
  liveClosed: number;
  userCount: number;
  userIds: string[];
  byExchange: Record<string, number>;
  liveErrors?: string[];
  message?: string;
}

async function clearZoneOpenTradeIfNeeded(
  db: Firestore,
  simTradeId: string,
): Promise<void> {
  for (const asset of ZONE_BOT_REGISTRY) {
    const state = await loadZoneBotState(db, asset);
    if (state.openTradeId === simTradeId) {
      await saveZoneBotState(db, asset, {
        ...state,
        openTradeId: null,
        reason: "Force-closed (kill switch)",
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

function fallbackPriceForSim(
  simTrade: SimTrade,
  allPrices: Awaited<ReturnType<typeof loadAllExchangePrices>>,
): number {
  const exchange = ((simTrade as SimTrade & { exchange?: string }).exchange ?? "BINANCE") as BrokerName;
  return (
    getPrice(allPrices, simTrade.symbol, exchange)
    ?? simTrade.currentPrice
    ?? simTrade.entryPrice
  );
}

async function runLiveOnlyCascade(
  db: Firestore,
  simTrade: SimTrade,
  simTradeId: string,
): Promise<ForceCloseSimTradeResult> {
  const allPrices = await loadAllExchangePrices(db);
  const fallbackPrice = fallbackPriceForSim(simTrade, allPrices);
  const recovery = await cascadeCloseLiveMirrors(
    db,
    simTradeId,
    fallbackPrice,
    allPrices,
  );

  if (recovery.liveAttempted === 0) {
    return {
      success: true,
      mode: "live-only",
      noop: true,
      simTrade: {
        id: simTradeId,
        symbol: simTrade.symbol,
        side: simTrade.side,
        status: simTrade.status,
      },
      liveAttempted: 0,
      liveClosed: 0,
      userCount: 0,
      userIds: [],
      byExchange: {},
      message: "Sim is already closed and all mirrors are reconciled.",
    };
  }

  await db
    .collection("simulator_logs")
    .add({
      timestamp: new Date().toISOString(),
      action: "KILL_SWITCH_LIVE_RECOVERY",
      details: `${simTrade.symbol} ${simTrade.side}: live-only recovery cascade — closed ${recovery.liveClosed}, errors ${recovery.liveErrors.length}`,
      signalId: simTrade.signalId,
      symbol: simTrade.symbol,
      capital: null,
      pnl: null,
      assetType: (simTrade as SimTrade & { assetType?: string }).assetType ?? "CRYPTO",
    })
    .catch(() => {});

  return buildCascadeResponse(simTrade, simTradeId, "live-only", recovery);
}

function buildCascadeResponse(
  simTrade: SimTrade,
  simTradeId: string,
  mode: ForceCloseMode,
  cascade: CascadeResult,
  extra?: Partial<ForceCloseSimTradeResult>,
): ForceCloseSimTradeResult {
  return {
    success: true,
    mode,
    simTrade: {
      id: simTradeId,
      symbol: simTrade.symbol,
      side: simTrade.side,
      status: simTrade.status,
      ...extra?.simTrade,
    },
    liveAttempted: cascade.liveAttempted,
    liveClosed: cascade.liveClosed,
    userCount: cascade.userCount,
    userIds: cascade.userIds,
    byExchange: cascade.byExchange,
    liveErrors: cascade.liveErrors.length > 0 ? cascade.liveErrors : undefined,
    ...extra,
  };
}

/**
 * Kill-switch core: close OPEN sim at market + cascade live mirrors, or
 * live-only recovery when sim is already CLOSED.
 */
export async function forceCloseSimTrade(
  db: Firestore,
  simTradeId: string,
): Promise<ForceCloseSimTradeResult> {
  const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
  if (!simDoc.exists) {
    throw new Error("Sim trade not found");
  }
  const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

  if (simTrade.status !== "OPEN") {
    return runLiveOnlyCascade(db, simTrade, simTradeId);
  }

  const allPrices = await loadAllExchangePrices(db);
  const exchange = ((simTrade as SimTrade & { exchange?: string }).exchange ?? "BINANCE") as BrokerName;
  const currentPrice =
    getPrice(allPrices, simTrade.symbol, exchange)
    ?? simTrade.currentPrice
    ?? simTrade.entryPrice;
  const killPrice = killSwitchExitPrice(simTrade.entryPrice, currentPrice);
  const assetType = (simTrade as SimTrade & { assetType?: string }).assetType ?? "CRYPTO";
  const stateDocId = getSimStateDocId(assetType);
  const simRef = db.collection("simulator_trades").doc(simTradeId);
  const stateRef = db.collection("config").doc(stateDocId);

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

    const txUnrealized = computeUnrealizedPnl(fresh, killPrice);
    const txExitFee =
      fresh.positionSize * fresh.remainingPct * SIM_CONFIG.EXCHANGE_FEE;
    const txNetPnl = txUnrealized - txExitFee;
    const txTotalRealized = fresh.realizedPnl + txNetPnl;

    const txCloseEvent = {
      type: "KILL_SWITCH" as const,
      price: killPrice,
      pnl: txNetPnl,
      fee: txExitFee,
      closePct: fresh.remainingPct,
      timestamp: new Date().toISOString(),
    };

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
      currentPrice: killPrice,
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
    throw new Error("Sim trade not found");
  }

  if (!txResult.flipped) {
    const recovery = await cascadeCloseLiveMirrors(
      db,
      simTradeId,
      currentPrice,
      allPrices,
    );
    return buildCascadeResponse(simTrade, simTradeId, "live-only", recovery, {
      raced: true,
    });
  }

  await markTradeForBlockchain(db, simTradeId).catch((e: unknown) => {
    console.error("[force-close] blockchain publish queue failed:", e);
  });

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
    .catch((e: unknown) => {
      console.error("[force-close] simulator_logs write failed:", e);
    });

  await clearZoneOpenTradeIfNeeded(db, simTradeId);

  const cascade = await cascadeCloseLiveMirrors(
    db,
    simTradeId,
    txResult.currentPrice,
    allPrices,
  );

  return {
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
  };
}

export interface OpenLiveMirrorPreview {
  id: string;
  userId: string;
  exchange: string;
  side: string;
  qty: number;
  simTradeId: string;
}

/** Find OPEN live mirrors matching symbol/side filters (client-side filter). */
export async function findOpenLiveMirrors(args: {
  db: Firestore;
  symbol?: string;
  side?: "BUY" | "SELL";
  simTradeId?: string;
}): Promise<OpenLiveMirrorPreview[]> {
  const { db, symbol, side, simTradeId } = args;
  const snap = await db.collection("live_trades").where("status", "==", "OPEN").get();
  const symNeedle = symbol?.toUpperCase() ?? "";

  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: String(data.userId ?? ""),
        exchange: String(data.exchange ?? ""),
        side: String(data.side ?? ""),
        qty: Number(data.remainingQty ?? data.quantity ?? 0),
        simTradeId: String(data.simTradeId ?? ""),
        signalSymbol: String(data.signalSymbol ?? data.symbol ?? ""),
      };
    })
    .filter((row) => {
      if (simTradeId && row.simTradeId !== simTradeId) return false;
      if (symNeedle && !row.signalSymbol.toUpperCase().includes(symNeedle.replace(".P", ""))) {
        return false;
      }
      if (side && row.side.toUpperCase() !== side) return false;
      return true;
    })
    .map(({ signalSymbol: _s, ...rest }) => rest);
}

/** Resolve simTradeIds to force-close from filters. */
export async function resolveSimTradeIdsForClose(args: {
  db: Firestore;
  simTradeId?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
}): Promise<string[]> {
  if (args.simTradeId) return [args.simTradeId];
  const mirrors = await findOpenLiveMirrors(args);
  return [...new Set(mirrors.map((m) => m.simTradeId).filter(Boolean))];
}
