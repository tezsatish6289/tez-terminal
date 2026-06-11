import type { Firestore } from "firebase-admin/firestore";
import type { SimTrade } from "@/lib/simulator";
import { BOT_SOURCE_BTC_ZONE } from "@/lib/bot-source-filter";
import { loadZoneBotState, saveZoneBotState } from "@/lib/zone-bot-state";

export interface DeleteSimTradePreview {
  simTradeId: string;
  symbol: string;
  side: string;
  status: string;
  entryPrice: number;
  openedAt: string;
  signalId: string | null;
}

export interface DeleteSimTradeResult {
  dryRun: boolean;
  simTradeId: string;
  preview: DeleteSimTradePreview;
  deleted: {
    simulatorTrade: boolean;
    simulatorLogs: number;
    dispatchState: number;
    liveTrades: number;
    liveTradeLogs: number;
    signal: boolean;
    zoneOpenTradeCleared: boolean;
  };
  openLiveTradesBlocked: Array<{ id: string; exchange: string; userId: string }>;
}

async function deleteQueryDocs(
  snap: FirebaseFirestore.QuerySnapshot,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) return snap.size;
  let n = 0;
  for (const doc of snap.docs) {
    await doc.ref.delete();
    n++;
  }
  return n;
}

/** Hard-delete one simulator trade and its related Firestore rows. */
export async function deleteSimTradeRecords(args: {
  db: Firestore;
  simTradeId: string;
  dryRun?: boolean;
  /** When true, delete live_trades even if still OPEN (Firestore only). */
  forceLiveDelete?: boolean;
}): Promise<DeleteSimTradeResult> {
  const { db, simTradeId, dryRun = false, forceLiveDelete = false } = args;

  const tradeSnap = await db.collection("simulator_trades").doc(simTradeId).get();
  if (!tradeSnap.exists) {
    throw new Error(`simulator_trades/${simTradeId} not found`);
  }

  const trade = { id: tradeSnap.id, ...tradeSnap.data() } as SimTrade;
  const signalId = trade.signalId ?? null;

  const preview: DeleteSimTradePreview = {
    simTradeId,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    entryPrice: trade.entryPrice,
    openedAt: trade.openedAt,
    signalId,
  };

  const liveSnap = await db
    .collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .get();

  const openLive = liveSnap.docs
    .filter((d) => d.data().status === "OPEN")
    .map((d) => ({
      id: d.id,
      exchange: String(d.data().exchange ?? ""),
      userId: String(d.data().userId ?? ""),
    }));

  if (openLive.length > 0 && !forceLiveDelete) {
    const err = new Error(
      `${openLive.length} OPEN live_trades still linked — close on exchange first or pass forceLiveDelete`,
    ) as Error & { openLiveTrades: typeof openLive; preview: DeleteSimTradePreview };
    err.openLiveTrades = openLive;
    err.preview = preview;
    throw err;
  }

  let simulatorLogs = 0;
  if (signalId) {
    const logSnap = await db.collection("simulator_logs").where("signalId", "==", signalId).get();
    simulatorLogs = await deleteQueryDocs(logSnap, dryRun);
  }

  const dispatchSnap = await db
    .collection("dispatch_state")
    .where("simTradeId", "==", simTradeId)
    .get();
  const dispatchState = await deleteQueryDocs(dispatchSnap, dryRun);

  let liveTrades = 0;
  let liveTradeLogs = 0;
  for (const liveDoc of liveSnap.docs) {
    if (!dryRun) {
      const logSnap = await db
        .collection("live_trade_logs")
        .where("tradeId", "==", liveDoc.id)
        .get();
      liveTradeLogs += await deleteQueryDocs(logSnap, dryRun);
      await liveDoc.ref.delete();
    }
    liveTrades++;
  }

  let signalDeleted = false;
  if (signalId) {
    const signalSnap = await db.collection("signals").doc(signalId).get();
    if (signalSnap.exists) {
      if (!dryRun) {
        const eventSnap = await db
          .collection("signal_events")
          .where("signalId", "==", signalId)
          .get();
        await deleteQueryDocs(eventSnap, dryRun);
        await signalSnap.ref.delete();
      }
      signalDeleted = true;
    }
  }

  let zoneOpenTradeCleared = false;
  if (trade.botSource === BOT_SOURCE_BTC_ZONE) {
    const state = await loadZoneBotState(db, "btc");
    if (state.openTradeId === simTradeId) {
      zoneOpenTradeCleared = true;
      if (!dryRun) {
        await saveZoneBotState(db, "btc", { ...state, openTradeId: null });
      }
    }
  }

  if (!dryRun) {
    await tradeSnap.ref.delete();
  }

  return {
    dryRun,
    simTradeId,
    preview,
    deleted: {
      simulatorTrade: !dryRun,
      simulatorLogs,
      dispatchState,
      liveTrades,
      liveTradeLogs,
      signal: signalDeleted && !dryRun,
      zoneOpenTradeCleared: zoneOpenTradeCleared && !dryRun,
    },
    openLiveTradesBlocked: [],
  };
}
