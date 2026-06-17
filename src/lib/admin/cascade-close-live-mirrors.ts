import type { Firestore } from "firebase-admin/firestore";
import {
  protectiveClose,
  cancelResidualExitOrders,
  type LiveTrade,
  type LiveTradeEvent,
  type Credentials,
} from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";
import {
  getPrice,
  deserializePrices,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  type AllExchangePrices,
  type ExchangeName,
} from "@/lib/exchanges";
import {
  applyTradeChangeToAggregates,
  type TradeAggregateSnapshot,
} from "@/lib/freedombot/aggregates";

export interface CascadeResult {
  liveClosed: number;
  liveErrors: string[];
  liveAttempted: number;
  userCount: number;
  userIds: string[];
  byExchange: Record<string, number>;
}

interface MirrorOutcome {
  ok: boolean;
  exchange: string;
  userId: string;
  error?: string;
}

/** Cap parallel exchange close calls during a cascade. */
export const CASCADE_CONCURRENCY = 10;

export async function loadAllExchangePrices(db: Firestore): Promise<AllExchangePrices> {
  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  if (!priceDoc.exists) {
    return {
      BINANCE: new Map(),
      BYBIT: new Map(),
      MEXC: new Map(),
      COINDCX: new Map(),
      HYPERLIQUID: new Map(),
      DHAN: new Map(),
    };
  }
  return deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
}

async function closeSingleMirror(
  db: Firestore,
  lt: LiveTrade,
  liveDocId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<MirrorOutcome> {
  try {
    const userId = lt.userId;
    const ltExchange = lt.exchange;
    const docIds = getSecretDocIds(ltExchange);
    let creds: Credentials | null = null;

    for (const secretId of docIds) {
      try {
        const secretDoc = await db
          .collection("users")
          .doc(userId)
          .collection("secrets")
          .doc(secretId)
          .get();
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
      return {
        ok: false,
        exchange: ltExchange,
        userId,
        error: `${lt.signalSymbol} [${ltExchange}]: no credentials found`,
      };
    }

    const livePrice =
      getPrice(allPrices, lt.signalSymbol, ltExchange) ?? fallbackPrice;

    try {
      const connector = getConnector(ltExchange as ExchangeName);
      const livePos = await connector.getPosition(lt.symbol, creds);
      const venueQty = livePos ? Math.abs(parseFloat(livePos.positionAmt || "0")) : 0;
      if (!livePos || venueQty < 1e-12) {
        const cleanup = await cancelResidualExitOrders(connector, lt.symbol, creds);
        const residualPending = !cleanup.success;
        const nowIso = new Date().toISOString();
        const syncedEvent: LiveTradeEvent = {
          type: "SYNCED_FROM_EXCHANGE",
          price: livePrice,
          pnl: 0,
          fee: 0,
          closePct: 0,
          quantity: lt.remainingQty,
          orderId: null,
          timestamp: nowIso,
        };
        const syncedEvents = [...(lt.events || []), syncedEvent];
        const syncedAggBefore: TradeAggregateSnapshot = { ...lt };
        const syncedPatch = {
          status: "CLOSED" as const,
          closedAt: nowIso,
          closeReason: "SYNCED_FROM_EXCHANGE",
          residualOrdersPendingCleanup: residualPending,
          slOrderId: null,
          tp1OrderId: null,
          tp2OrderId: null,
          tp3OrderId: null,
          events: syncedEvents,
        };
        await db.collection("live_trades").doc(liveDocId).update(syncedPatch);
        await applyTradeChangeToAggregates(db, syncedAggBefore, {
          ...syncedAggBefore,
          ...syncedPatch,
        });
        await db.collection("live_trade_logs").add({
          timestamp: nowIso,
          action: "SYNCED_FROM_EXCHANGE",
          details: `${lt.signalSymbol} ${lt.side} reconciled (sim cascade) — venue shows no open position. Skipped protectiveClose to avoid phantom reverse order.`,
          symbol: lt.signalSymbol,
          userId,
          exchange: ltExchange,
          assetType: ltExchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
        });
        return { ok: true, exchange: ltExchange, userId };
      }
    } catch (preErr) {
      console.warn(
        `[ForceClose] orphan pre-check failed for ${lt.signalSymbol} [${ltExchange}]; falling through to protectiveClose:`,
        preErr instanceof Error ? preErr.message : String(preErr),
      );
    }

    const closeResult = await protectiveClose(lt, "KILL_SWITCH", livePrice, creds);

    if (closeResult.updatedFields.status === "CLOSED") {
      await db.collection("live_trades").doc(liveDocId).update({
        ...closeResult.updatedFields,
        events: [...(lt.events || []), closeResult.newEvent],
      });
      await applyTradeChangeToAggregates(db, { ...lt }, {
        ...lt,
        ...closeResult.updatedFields,
        events: [...(lt.events || []), closeResult.newEvent],
      }).catch((e) => {
        console.warn(
          `[ForceClose] aggregate bump failed for ${liveDocId}: ${e instanceof Error ? e.message : String(e)}`,
        );
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
      return { ok: true, exchange: ltExchange, userId };
    }

    return {
      ok: false,
      exchange: ltExchange,
      userId,
      error: `${lt.signalSymbol} [${ltExchange}]: ${closeResult.warning ?? "close did not fill"}`,
    };
  } catch (err) {
    return {
      ok: false,
      exchange: lt.exchange,
      userId: lt.userId,
      error: `${lt.signalSymbol} [${lt.exchange}]: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Close every OPEN live_trades doc linked to `simTradeId`. Never throws. */
export async function cascadeCloseLiveMirrors(
  db: Firestore,
  simTradeId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<CascadeResult> {
  const liveErrors: string[] = [];
  const byExchange: Record<string, number> = {};
  const userIds = new Set<string>();

  const liveSnap = await db
    .collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  const liveAttempted = liveSnap.docs.length;
  if (liveAttempted === 0) {
    return {
      liveClosed: 0,
      liveErrors,
      liveAttempted: 0,
      userCount: 0,
      userIds: [],
      byExchange,
    };
  }

  type Job = { lt: LiveTrade; liveDocId: string };
  const jobs: Job[] = liveSnap.docs.map((d) => {
    const lt = { id: d.id, ...d.data() } as LiveTrade;
    if (lt.userId) userIds.add(lt.userId);
    return { lt, liveDocId: d.id };
  });

  let liveClosed = 0;
  for (let i = 0; i < jobs.length; i += CASCADE_CONCURRENCY) {
    const batch = jobs.slice(i, i + CASCADE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((j) =>
        closeSingleMirror(db, j.lt, j.liveDocId, fallbackPrice, allPrices),
      ),
    );
    for (let k = 0; k < settled.length; k++) {
      const s = settled[k]!;
      const j = batch[k]!;
      if (s.status === "fulfilled") {
        const out = s.value;
        if (out.ok) {
          liveClosed++;
          byExchange[out.exchange] = (byExchange[out.exchange] ?? 0) + 1;
        } else if (out.error) {
          liveErrors.push(out.error);
        }
      } else {
        const reason =
          s.reason instanceof Error ? s.reason.message : String(s.reason);
        liveErrors.push(
          `${j.lt.signalSymbol} [${j.lt.exchange}]: unexpected throw — ${reason}`,
        );
      }
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

/** Close OPEN live rows matching filters. Groups by simTradeId for cascade. */
export async function closeOpenLiveMirrorsByFilter(args: {
  db: Firestore;
  symbol?: string;
  side?: "BUY" | "SELL";
  simTradeId?: string;
  /** When true, only close rows whose sim is missing or already CLOSED. */
  orphansOnly?: boolean;
}): Promise<{
  simTradeIds: string[];
  cascadeResults: Array<{ simTradeId: string; result: CascadeResult }>;
  skippedOpenSim: string[];
  liveClosed: number;
  liveAttempted: number;
  liveErrors: string[];
  byExchange: Record<string, number>;
}> {
  const { db, symbol, side, simTradeId: simTradeIdFilter, orphansOnly = false } = args;
  const allPrices = await loadAllExchangePrices(db);
  const snap = await db.collection("live_trades").where("status", "==", "OPEN").get();
  const symNeedle = symbol?.toUpperCase().replace(".P", "") ?? "";

  type Row = { simTradeId: string; lt: LiveTrade; liveDocId: string; fallbackPrice: number };
  const rows: Row[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const signalSymbol = String(data.signalSymbol ?? data.symbol ?? "");
    const rowSide = String(data.side ?? "").toUpperCase();
    if (symNeedle && !signalSymbol.toUpperCase().includes(symNeedle)) continue;
    if (side && rowSide !== side) continue;

    const simTradeId = String(data.simTradeId ?? "");
    if (!simTradeId) continue;
    if (simTradeIdFilter && simTradeId !== simTradeIdFilter) continue;

    const lt = { id: doc.id, ...data } as LiveTrade;
    const exchange = lt.exchange as ExchangeName;
    const fallbackPrice =
      getPrice(allPrices, lt.signalSymbol, exchange) ?? lt.entryPrice;
    rows.push({ simTradeId, lt, liveDocId: doc.id, fallbackPrice });
  }

  const skippedOpenSim: string[] = [];
  const simTradeIds = new Set<string>();

  if (orphansOnly) {
    for (const simTradeId of new Set(rows.map((r) => r.simTradeId))) {
      const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
      if (simDoc.exists && (simDoc.data()?.status as string) === "OPEN") {
        skippedOpenSim.push(simTradeId);
        continue;
      }
      simTradeIds.add(simTradeId);
    }
  } else {
    for (const row of rows) simTradeIds.add(row.simTradeId);
  }

  const cascadeResults: Array<{ simTradeId: string; result: CascadeResult }> = [];
  let liveClosed = 0;
  let liveAttempted = 0;
  const liveErrors: string[] = [];
  const byExchange: Record<string, number> = {};

  for (const simTradeId of simTradeIds) {
    const group = rows.filter((r) => r.simTradeId === simTradeId);
    const fallbackPrice = group[0]?.fallbackPrice ?? 0;
    const result = await cascadeCloseLiveMirrors(
      db,
      simTradeId,
      fallbackPrice,
      allPrices,
    );
    cascadeResults.push({ simTradeId, result });
    liveClosed += result.liveClosed;
    liveAttempted += result.liveAttempted;
    liveErrors.push(...result.liveErrors);
    for (const [ex, n] of Object.entries(result.byExchange)) {
      byExchange[ex] = (byExchange[ex] ?? 0) + n;
    }
  }

  return {
    simTradeIds: Array.from(simTradeIds),
    cascadeResults,
    skippedOpenSim,
    liveClosed,
    liveAttempted,
    liveErrors,
    byExchange,
  };
}
