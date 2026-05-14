/**
 * Refresh exchange-reported realized PnL for closed live_trades (FreedomBot dashboard + admin).
 * Any crypto connector that implements getClosedPnl is supported (BYBIT, COINDCX; future BINANCE/MEXC).
 *
 * **Bybit:** rows are selected by `orderId` matching stored trade order ids when possible; otherwise
 * a ±5m window around open/close plus optional `side`.
 *
 * **CoinDCX:** rows in [open − 5m, close + 5m] (incl. funding); optional `side` when the venue sends it.
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

/** Rows from `openedAt − pre` through `closedAt + post` count toward this trade (incl. funding on CoinDCX). */
export const EXCHANGE_PNL_TRADE_WINDOW_PRE_MS = 5 * 60 * 1000;
export const EXCHANGE_PNL_TRADE_WINDOW_POST_MS = 5 * 60 * 1000;

/** Query venue APIs from this far before open so rows inside the pre-window are returned. */
export const EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS = EXCHANGE_PNL_TRADE_WINDOW_PRE_MS;

/** @deprecated Use EXCHANGE_PNL_TRADE_WINDOW_POST_MS — kept for imports that still reference the old name. */
export const EXCHANGE_PNL_POST_CLOSE_BUFFER_MS = EXCHANGE_PNL_TRADE_WINDOW_POST_MS;

/** CoinDCX passbook rows often land after `closedAt`; widen window vs ±5m Bybit default. */
export const EXCHANGE_PNL_COINDCX_WINDOW_PRE_MS = 15 * 60 * 1000;
export const EXCHANGE_PNL_COINDCX_WINDOW_POST_MS = 6 * 60 * 60 * 1000;

/** `getClosedPnl` startTime: fetch from far enough before open for the active window. */
export function exchangeClosedPnlFetchStartMs(exchange: ExchangeName, openedAtMs: number): number {
  const lookback =
    exchange === "COINDCX" ? EXCHANGE_PNL_COINDCX_WINDOW_PRE_MS : EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS;
  return Math.max(0, openedAtMs - lookback);
}

/** Window overrides for `computeClosedTradeExchangePnlMetrics` on CoinDCX. */
export function coindcxClosedPnlWindowOpts(): Pick<ClosedPnlWindowOpts, "windowPreMs" | "windowPostMs"> {
  return {
    windowPreMs: EXCHANGE_PNL_COINDCX_WINDOW_PRE_MS,
    windowPostMs: EXCHANGE_PNL_COINDCX_WINDOW_POST_MS,
  };
}

/** CoinDCX sometimes returns unix seconds; Bybit uses ms. */
export function recordTimeMs(r: ClosedPnlRecord): number {
  const t = r.createdTime;
  if (!t || Number.isNaN(t)) return 0;
  return t < 1e12 ? t * 1000 : t;
}

/** Order ids stored on `live_trades` that may appear on Bybit closed-PnL rows. */
export function bybitReconcileOrderIdsFromLiveTrade(data: Record<string, unknown>): string[] {
  const keys = ["entryOrderId", "slOrderId", "tp1OrderId", "tp2OrderId", "tp3OrderId"] as const;
  const out: string[] = [];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

export interface ClosedPnlWindowOpts {
  /** When set, only rows whose `side` matches (or row has no side) are included. Ignored when rows are selected by `orderId`. */
  tradeSide?: "BUY" | "SELL";
  /**
   * Bybit: when non-empty, prefer rows whose `orderId` is in this set (exact match, case-insensitive).
   * If at least one row matches, time/side window is not used for selection. If none match, falls back to the time window.
   */
  matchAnyOrderId?: string[];
  /** Optional window overrides (CoinDCX passbook rows can lag `closedAt`). */
  windowPreMs?: number;
  windowPostMs?: number;
}

function matchAnyOrderIdSet(opts?: ClosedPnlWindowOpts): Set<string> | null {
  const raw = opts?.matchAnyOrderId;
  if (!raw?.length) return null;
  const set = new Set<string>();
  for (const x of raw) {
    const u = String(x).trim().toUpperCase();
    if (u.length > 0) set.add(u);
  }
  return set.size > 0 ? set : null;
}

export function closedPnlRecordsForTradeWindow(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
  opts?: ClosedPnlWindowOpts,
): ClosedPnlRecord[] {
  const pre = opts?.windowPreMs ?? EXCHANGE_PNL_TRADE_WINDOW_PRE_MS;
  const post = opts?.windowPostMs ?? EXCHANGE_PNL_TRADE_WINDOW_POST_MS;
  const lo = openedAtMs - pre;
  const hi = closedAtMs + post;
  const want = opts?.tradeSide?.toUpperCase() as "BUY" | "SELL" | undefined;
  return records.filter((r) => {
    const ts = recordTimeMs(r);
    if (ts < lo || ts > hi) return false;
    if (!want || r.side == null || String(r.side).trim() === "") return true;
    const rs = String(r.side).toUpperCase();
    if (rs === want) return true;
    if (want === "BUY" && (rs === "LONG" || rs === "BUY_LONG")) return true;
    if (want === "SELL" && (rs === "SHORT" || rs === "SELL_SHORT")) return true;
    return false;
  });
}

/**
 * Rows to aggregate for one trade: Bybit prefers `orderId` ∩ stored trade ids; otherwise time window (+ side).
 * Window defaults to ±`EXCHANGE_PNL_TRADE_WINDOW_*`; CoinDCX often needs wider `windowPreMs` / `windowPostMs`.
 */
export function selectClosedPnlRecordsForTrade(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
  opts?: ClosedPnlWindowOpts,
): ClosedPnlRecord[] {
  const idSet = matchAnyOrderIdSet(opts);
  if (idSet) {
    const matched = records.filter((r) => {
      const oid = r.orderId != null ? String(r.orderId).trim().toUpperCase() : "";
      return oid.length > 0 && idSet.has(oid);
    });
    if (matched.length > 0) return matched;
  }
  return closedPnlRecordsForTradeWindow(records, openedAtMs, closedAtMs, opts);
}

export function sumPnlInWindow(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
  opts?: ClosedPnlWindowOpts,
): number {
  return selectClosedPnlRecordsForTrade(records, openedAtMs, closedAtMs, opts).reduce(
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

/** Prefer Bybit `orderId` match; else sum rows in [open − 5m, close + 5m] with optional `side`. */
export function computeClosedTradeExchangePnlMetrics(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
  windowOpts?: ClosedPnlWindowOpts,
): ClosedTradeExchangePnlMetrics {
  const inWin = selectClosedPnlRecordsForTrade(records, openedAtMs, closedAtMs, windowOpts);
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
    side?: "BUY" | "SELL";
    entryOrderId?: string;
    slOrderId?: string | null;
    tp1OrderId?: string | null;
    tp2OrderId?: string | null;
    tp3OrderId?: string | null;
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
      Math.max(0, exchangeClosedPnlFetchStartMs("BYBIT", openedAtMs)),
    );
    return computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs, {
      tradeSide: trade.side === "SELL" ? "SELL" : "BUY",
      matchAnyOrderId: bybitReconcileOrderIdsFromLiveTrade(trade as Record<string, unknown>),
    });
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
 * For each closed production trade on `exchange`, fetch closed-PnL / position transaction rows
 * from the venue and aggregate rows for that trade (Bybit: order id match when possible; else
 * `[openedAt − 5m, closedAt + 5m]` and optional side). Writes back exchangeRealizedPnl plus reconciliation metadata.
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
    if (!tradeBelongsToVenue(t.exchange as string | undefined, exchange)) return false;
    const pnl = t.exchangeRealizedPnl;
    if (typeof pnl === "number" && !Number.isNaN(pnl)) return false;
    return true;
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
      const startArg = exchangeClosedPnlFetchStartMs(exchange, openedAtMs);
      const records = await connector.getClosedPnl!(exchangeSymbol, creds, startArg);
      const metrics = computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs, {
        tradeSide: String(lt.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        matchAnyOrderId:
          exchange === "BYBIT"
            ? bybitReconcileOrderIdsFromLiveTrade(lt as unknown as Record<string, unknown>)
            : undefined,
        ...(exchange === "COINDCX" ? coindcxClosedPnlWindowOpts() : {}),
      });
      if (metrics.recordCount === 0) continue;

      const patch: Record<string, unknown> = {
        exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
        exchangePnlReconciledAt: nowIso,
        exchangePnlSource: "exchange_closed_pnl_api",
      };
      if (metrics.exchangeAvgEntryPrice != null) {
        patch.exchangeAvgEntryPrice = metrics.exchangeAvgEntryPrice;
      }
      if (metrics.exchangeAvgExitPrice != null) {
        patch.exchangeAvgExitPrice = metrics.exchangeAvgExitPrice;
      }
      if (metrics.exchangeQty != null) {
        patch.exchangeQty = metrics.exchangeQty;
      }
      await doc.ref.update(patch);
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
