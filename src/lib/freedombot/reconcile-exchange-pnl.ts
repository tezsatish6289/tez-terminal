/**
 * Refresh exchange-reported realized PnL for closed live_trades (FreedomBot dashboard + admin).
 * Any crypto connector that implements getClosedPnl is supported (BYBIT, COINDCX; future BINANCE/MEXC).
 */
import type { Firestore } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import {
  getConnector,
  getSecretDocIds,
  docMatchesExchange,
  CRYPTO_BROKERS,
  isExchangeSupported,
  type ClosedPnlRecord,
  type BrokerName,
  type ExchangeCredentials,
  type ExchangeName,
} from "@/lib/exchanges";

/** Legacy rows without `exchange` field are treated as Bybit. */
export function tradeBelongsToVenue(
  docExchange: string | undefined | null,
  venue: ExchangeName,
): boolean {
  const ex = String(docExchange ?? "").toUpperCase();
  if (ex === venue) return true;
  if (!ex && venue === "BYBIT") return true;
  return false;
}

/** True when the connector exposes closed-PnL history for reconciliation. */
export function exchangeSupportsClosedPnlReconciliation(exchange: string): boolean {
  if (!isExchangeSupported(exchange)) return false;
  const upper = exchange.toUpperCase() as BrokerName;
  if (!CRYPTO_BROKERS.includes(upper)) return false;
  try {
    return typeof getConnector(exchange).getClosedPnl === "function";
  } catch {
    return false;
  }
}

/** Extra lookback before `openedAt` when querying exchange closed-PnL APIs. */
export const EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS = 120_000;

/** Post-close window so delayed venue rows (funding/settlement) still count. */
export const EXCHANGE_PNL_POST_CLOSE_BUFFER_MS = 3 * 60 * 60 * 1000;

/** CoinDCX sometimes returns unix seconds; Bybit uses ms. */
export function recordTimeMs(r: ClosedPnlRecord): number {
  const t = r.createdTime;
  if (!t || Number.isNaN(t)) return 0;
  return t < 1e12 ? t * 1000 : t;
}

export function closedPnlRecordsForTradeWindow(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
): ClosedPnlRecord[] {
  const hi = closedAtMs + EXCHANGE_PNL_POST_CLOSE_BUFFER_MS;
  return records.filter((r) => {
    const ts = recordTimeMs(r);
    return ts >= openedAtMs && ts <= hi;
  });
}

export function sumPnlInWindow(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
): number {
  return closedPnlRecordsForTradeWindow(records, openedAtMs, closedAtMs).reduce(
    (sum, r) => sum + r.closedPnl,
    0,
  );
}

export interface ClosedTradeExchangePnlMetrics {
  exchangeRealizedPnl: number;
  exchangeAvgEntryPrice: number | null;
  exchangeAvgExitPrice: number | null;
  exchangeQty: number | null;
  recordCount: number;
}

/** Sum closed-PnL rows that belong to this trade's open→close window (not the whole symbol history). */
export function computeClosedTradeExchangePnlMetrics(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
): ClosedTradeExchangePnlMetrics {
  const inWin = closedPnlRecordsForTradeWindow(records, openedAtMs, closedAtMs);
  const totalPnl = inWin.reduce((s, r) => s + r.closedPnl, 0);
  const totalQty = inWin.reduce((s, r) => s + r.qty, 0);
  if (inWin.length === 0) {
    return {
      exchangeRealizedPnl: totalPnl,
      exchangeAvgEntryPrice: null,
      exchangeAvgExitPrice: null,
      exchangeQty: null,
      recordCount: 0,
    };
  }
  const avgEntry =
    totalQty > 0
      ? inWin.reduce((s, r) => s + r.avgEntryPrice * r.qty, 0) / totalQty
      : null;
  const avgExit =
    totalQty > 0
      ? inWin.reduce((s, r) => s + r.avgExitPrice * r.qty, 0) / totalQty
      : null;
  return {
    exchangeRealizedPnl: totalPnl,
    exchangeAvgEntryPrice:
      avgEntry != null && Number.isFinite(avgEntry) ? Number(avgEntry.toFixed(8)) : null,
    exchangeAvgExitPrice:
      avgExit != null && Number.isFinite(avgExit) ? Number(avgExit.toFixed(8)) : null,
    exchangeQty:
      totalQty > 0 && Number.isFinite(totalQty) ? Number(totalQty.toFixed(6)) : null,
    recordCount: inWin.length,
  };
}

/**
 * After a Bybit live trade is marked CLOSED, pull `/v5/position/closed-pnl` and persist
 * exchange-reported PnL (retries while the venue has not yet indexed the close).
 */
export async function applyBybitExchangeClosedPnlAfterClose(
  db: Firestore,
  tradeDocId: string,
  trade: {
    symbol: string;
    openedAt: string;
    closedAt: string | null;
  },
  creds: ExchangeCredentials,
): Promise<void> {
  if (!trade.closedAt) return;
  const connector = getConnector("BYBIT");
  if (typeof connector.getClosedPnl !== "function") return;

  const openedAtMs = new Date(trade.openedAt).getTime();
  const closedAtMs = new Date(trade.closedAt).getTime();
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) return;

  const fetchMetrics = async () => {
    const records = await connector.getClosedPnl!(
      trade.symbol,
      creds,
      Math.max(0, openedAtMs - EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS),
    );
    return computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs);
  };

  let metrics = await fetchMetrics();
  for (let attempt = 0; attempt < 5 && metrics.recordCount === 0; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 900));
    metrics = await fetchMetrics();
  }

  if (metrics.recordCount === 0) return;

  const nowIso = new Date().toISOString();
  await db.collection("live_trades").doc(tradeDocId).update({
    exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
    ...(metrics.exchangeAvgEntryPrice != null
      ? { exchangeAvgEntryPrice: metrics.exchangeAvgEntryPrice }
      : {}),
    ...(metrics.exchangeAvgExitPrice != null
      ? { exchangeAvgExitPrice: metrics.exchangeAvgExitPrice }
      : {}),
    ...(metrics.exchangeQty != null ? { exchangeQty: metrics.exchangeQty } : {}),
    exchangePnlReconciledAt: nowIso,
    exchangePnlSource: "exchange_closed_pnl_api",
  });
}

export async function loadCryptoCredentials(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
): Promise<(ExchangeCredentials & { testnet?: boolean }) | null> {
  const docIds = getSecretDocIds(exchange);
  for (const id of docIds) {
    try {
      const secretDoc = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
      if (!secretDoc.exists) continue;
      const data = secretDoc.data()!;
      if (!docMatchesExchange(data, exchange, id)) continue;
      const apiKey = decrypt(data.encryptedKey);
      const apiSecret = decrypt(data.encryptedSecret);
      return {
        apiKey,
        apiSecret,
        testnet: data.useTestnet === true,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export interface ReconcileExchangePnlResult {
  reconciled: number;
  skippedNoApi: number;
  errors: string[];
  /** Sum of exchangeRealizedPnl for closed trades on this exchange after updates */
  totalClosedExchangePnl: number;
}

/**
 * For each closed production trade on `exchange`, fetch closed PnL rows from the venue
 * and sum those falling between openedAt and closedAt. Writes back exchangeRealizedPnl
 * plus reconciliation metadata.
 */
export async function reconcileUserExchangeClosedPnl(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
  creds: ExchangeCredentials,
): Promise<ReconcileExchangePnlResult> {
  const result: ReconcileExchangePnlResult = {
    reconciled: 0,
    skippedNoApi: 0,
    errors: [],
    totalClosedExchangePnl: 0,
  };

  if (!exchangeSupportsClosedPnlReconciliation(exchange)) {
    result.skippedNoApi = 1;
    return result;
  }

  const connector = getConnector(exchange);

  const snap = await db.collection("live_trades").where("userId", "==", uid).get();

  const closedOnVenue = snap.docs.filter((d) => {
    const t = d.data();
    if (t.testnet !== false) return false;
    if (t.status !== "CLOSED") return false;
    return tradeBelongsToVenue(t.exchange as string | undefined, exchange);
  });

  const nowIso = new Date().toISOString();

  for (const doc of closedOnVenue) {
    const lt = doc.data();
    const signalSymbol = String(lt.signalSymbol ?? lt.symbol ?? "");
    if (!signalSymbol) continue;

    const openedAtMs = new Date(String(lt.openedAt ?? 0)).getTime();
    const closedAtMs = lt.closedAt ? new Date(String(lt.closedAt)).getTime() : Date.now();
    if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) continue;

    const exchangeSymbol = connector.normalizeSymbol(signalSymbol);

    try {
      const startArg = Math.max(0, openedAtMs - 120_000);
      const records = await connector.getClosedPnl!(exchangeSymbol, creds, startArg);
      const exchangePnl = sumPnlInWindow(records, openedAtMs, closedAtMs);

      await doc.ref.update({
        exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
        exchangePnlReconciledAt: nowIso,
        exchangePnlSource: "exchange_closed_pnl_api",
      });
      result.reconciled++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${exchangeSymbol}: ${msg}`);
    }

    // Light throttle — some venues rate-limit burst GETs
    await new Promise((r) => setTimeout(r, 120));
  }

  // Re-sum totals for this exchange from Firestore (authoritative after writes)
  const snap2 = await db.collection("live_trades").where("userId", "==", uid).get();
  for (const d of snap2.docs) {
    const t = d.data();
    if (t.testnet !== false) continue;
    if (t.status !== "CLOSED") continue;
    if (!tradeBelongsToVenue(t.exchange as string | undefined, exchange)) continue;
    const pnl = t.exchangeRealizedPnl;
    if (typeof pnl === "number" && !Number.isNaN(pnl)) {
      result.totalClosedExchangePnl += pnl;
    }
  }

  result.totalClosedExchangePnl = Number(result.totalClosedExchangePnl.toFixed(4));
  return result;
}
