/**
 * Refresh exchange-reported realized PnL for closed live_trades (FreedomBot dashboard + admin).
 * Any crypto connector that implements getClosedPnl is supported (BYBIT, COINDCX; future BINANCE/MEXC).
 *
 * Selection strategy is shared across venues:
 *   1. Try exact order-id match (Bybit `orderId`, CoinDCX `parent_id`) against
 *      the trade's stored entry / SL / TP / close / historical-SL ids. This
 *      is the high-confidence path and never mis-attributes PnL between
 *      adjacent trades on the same symbol.
 *   2. Fall back to a venue-tuned time window around open/close + optional
 *      `side` filter. Bybit uses ±30m / +6h, CoinDCX uses ±15m / +6h
 *      (passbook rows on CoinDCX can lag `closedAt` by several hours).
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
import {
  applyTradeChangeToAggregates,
  rebuildDeploymentAggregates,
  type TradeAggregateSnapshot,
} from "@/lib/freedombot/aggregates";

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

/** Bybit closed-pnl `createdTime` can trail Firestore `closedAt` beyond ±5m; widen client window + API bounds. */
export const EXCHANGE_PNL_BYBIT_WINDOW_PRE_MS = 30 * 60 * 1000;
export const EXCHANGE_PNL_BYBIT_WINDOW_POST_MS = 6 * 60 * 60 * 1000;

/** `getClosedPnl` startTime: fetch from far enough before open for the active window. */
export function exchangeClosedPnlFetchStartMs(exchange: ExchangeName, openedAtMs: number): number {
  const lookback =
    exchange === "COINDCX"
      ? EXCHANGE_PNL_COINDCX_WINDOW_PRE_MS
      : exchange === "BYBIT"
        ? EXCHANGE_PNL_BYBIT_WINDOW_PRE_MS
        : EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS;
  return Math.max(0, openedAtMs - lookback);
}

/** Bybit `/v5/position/closed-pnl` `endTime` upper bound (ms) so the row is inside the query slice. */
export function bybitClosedPnlApiEndMs(closedAtMs: number): number {
  return closedAtMs + EXCHANGE_PNL_BYBIT_WINDOW_POST_MS;
}

/** Window overrides for `computeClosedTradeExchangePnlMetrics` on CoinDCX. */
export function coindcxClosedPnlWindowOpts(): Pick<ClosedPnlWindowOpts, "windowPreMs" | "windowPostMs"> {
  return {
    windowPreMs: EXCHANGE_PNL_COINDCX_WINDOW_PRE_MS,
    windowPostMs: EXCHANGE_PNL_COINDCX_WINDOW_POST_MS,
  };
}

export function bybitClosedPnlWindowOpts(): Pick<ClosedPnlWindowOpts, "windowPreMs" | "windowPostMs"> {
  return {
    windowPreMs: EXCHANGE_PNL_BYBIT_WINDOW_PRE_MS,
    windowPostMs: EXCHANGE_PNL_BYBIT_WINDOW_POST_MS,
  };
}

/** CoinDCX sometimes returns unix seconds; Bybit uses ms. */
export function recordTimeMs(r: ClosedPnlRecord): number {
  let t = r.createdTime;
  if (!t || Number.isNaN(t)) t = r.updatedTime ?? 0;
  if (!t || Number.isNaN(t)) return 0;
  return t < 1e12 ? t * 1000 : t;
}

/** Order ids stored on `live_trades` that may appear on the venue's
 *  closed-PnL / position-transaction rows. Both Bybit (`closedPnl.orderId`)
 *  and CoinDCX (`positions/transactions.parent_id`) carry the order id that
 *  produced each fill, so the same set of ids works for both. Includes
 *  `closeOrderId` from protective closes and any historical SL ids the
 *  trade has accumulated through trailing-stop replacements (see
 *  `historicalSlOrderIds` populated in the cron).
 *
 *  `entryOrderId` is intentionally included even though entry produces a
 *  zero-PnL transaction — keeping it in the set lets reconciliation pull
 *  the entry row for fee accounting in future enhancements. */
export function exchangeReconcileOrderIdsFromLiveTrade(data: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const scalarKeys = [
    "entryOrderId",
    "slOrderId",
    "tp1OrderId",
    "tp2OrderId",
    "tp3OrderId",
    "closeOrderId",
  ] as const;
  for (const k of scalarKeys) {
    const v = data[k];
    if (typeof v === "string" && v.trim().length > 0) out.add(v.trim());
  }
  const hist = data["historicalSlOrderIds"];
  if (Array.isArray(hist)) {
    for (const v of hist) {
      if (typeof v === "string" && v.trim().length > 0) out.add(v.trim());
    }
  }
  return Array.from(out);
}

/** @deprecated Use `exchangeReconcileOrderIdsFromLiveTrade` — same set of ids,
 *  works for any venue that surfaces order id on its PnL rows. */
export function bybitReconcileOrderIdsFromLiveTrade(data: Record<string, unknown>): string[] {
  return exchangeReconcileOrderIdsFromLiveTrade(data);
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

/** Prefer Bybit `orderId` match; else sum rows in the trade time window (connector-specific width) with optional side. */
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

export interface ReconcileTradeExchangePnlResult {
  reconciled: boolean;
  recordCount: number;
  exchangeRealizedPnl?: number;
  exchangeAvgExitPrice?: number | null;
  attempts: number;
  reason?: string;
}

/**
 * After a live trade is marked CLOSED, pull the venue's closed-PnL rows and
 * persist `exchangeRealizedPnl` (and entry/exit/qty when available).
 *
 * Retries up to `maxAttempts` while the venue hasn't yet indexed the close.
 * Never writes a "0" placeholder when no rows are found — leaves the field
 * untouched so a future tick can fill it in.
 *
 * Exchange-agnostic: works for any connector exposing `getClosedPnl`.
 * Bybit-specific tuning (order id matching + 30m/6h window) is applied
 * automatically when `exchange === "BYBIT"`.
 */
export async function reconcileTradeExchangePnl(
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
    closeOrderId?: string | null;
    historicalSlOrderIds?: string[];
  },
  creds: ExchangeCredentials,
  exchange: ExchangeName,
  opts?: { maxAttempts?: number; delayMs?: number },
): Promise<ReconcileTradeExchangePnlResult> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const delayMs = opts?.delayMs ?? 900;

  if (!trade.closedAt) return { reconciled: false, recordCount: 0, attempts: 0, reason: "trade_not_closed" };
  const connector = getConnector(exchange);
  if (typeof connector.getClosedPnl !== "function") {
    return { reconciled: false, recordCount: 0, attempts: 0, reason: "exchange_no_closed_pnl_api" };
  }

  const openedAtMs = new Date(trade.openedAt).getTime();
  const closedAtMs = new Date(trade.closedAt).getTime();
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) {
    return { reconciled: false, recordCount: 0, attempts: 0, reason: "invalid_timestamps" };
  }

  const windowOpts = {
    tradeSide: trade.side === "SELL" ? "SELL" : "BUY" as "BUY" | "SELL",
    // Bybit, CoinDCX and Hyperliquid all carry the order id on their PnL
    // rows (Hyperliquid uses `oid`, surfaced via userFillsByTime). Exact id
    // match is far more reliable than the time-window fallback.
    matchAnyOrderId:
      exchange === "BYBIT" || exchange === "COINDCX" || exchange === "HYPERLIQUID"
        ? exchangeReconcileOrderIdsFromLiveTrade(trade as Record<string, unknown>)
        : undefined,
    ...(exchange === "COINDCX" ? coindcxClosedPnlWindowOpts() : {}),
    ...(exchange === "BYBIT" ? bybitClosedPnlWindowOpts() : {}),
  };

  const fetchMetrics = async () => {
    const records = await connector.getClosedPnl!(
      trade.symbol,
      creds,
      Math.max(0, exchangeClosedPnlFetchStartMs(exchange, openedAtMs)),
      exchange === "BYBIT" ? bybitClosedPnlApiEndMs(closedAtMs) : undefined,
    );
    const metrics = computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs, windowOpts);
    const inWin = selectClosedPnlRecordsForTrade(records, openedAtMs, closedAtMs, windowOpts).sort(
      (a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0),
    );
    const lastExitPrice = inWin[0]
      ? (parseFloat(String(inWin[0].avgExitPrice ?? 0)) || null)
      : null;
    return { metrics, lastExitPrice };
  };

  let attempts = 0;
  let result = await fetchMetrics();
  attempts++;

  while (attempts < maxAttempts && result.metrics.recordCount === 0) {
    await new Promise((r) => setTimeout(r, delayMs));
    result = await fetchMetrics();
    attempts++;
  }

  if (result.metrics.recordCount === 0) {
    return {
      reconciled: false,
      recordCount: 0,
      attempts,
      reason: "no_closed_pnl_rows_in_window",
    };
  }

  const { metrics, lastExitPrice } = result;
  const nowIso = new Date().toISOString();
  // Snapshot the doc BEFORE we patch in the new exchange PnL so the aggregate
  // delta sees old vs new bestRealizedPnl. Best-effort: if the doc has been
  // deleted in flight we just skip the aggregate side effect.
  const tradeRef = db.collection("live_trades").doc(tradeDocId);
  const beforeSnap = await tradeRef.get();
  const beforeData = beforeSnap.exists
    ? (beforeSnap.data() as TradeAggregateSnapshot)
    : null;
  const patch: Record<string, unknown> = {
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
  };
  await tradeRef.update(patch);
  if (beforeData) {
    try {
      await applyTradeChangeToAggregates(db, beforeData, {
        ...beforeData,
        ...patch,
      } as TradeAggregateSnapshot);
    } catch (e) {
      console.warn(
        `[reconcile-exchange-pnl] aggregate delta failed for ${tradeDocId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    reconciled: true,
    recordCount: metrics.recordCount,
    exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
    exchangeAvgExitPrice: lastExitPrice,
    attempts,
  };
}

/**
 * @deprecated Use `reconcileTradeExchangePnl(..., "BYBIT")` instead.
 * Retained for callers in older code paths.
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
  await reconcileTradeExchangePnl(db, tradeDocId, trade, creds, "BYBIT");
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
 * widened time window + optional side). Writes back exchangeRealizedPnl plus reconciliation metadata.
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
      const endArg = exchange === "BYBIT" ? bybitClosedPnlApiEndMs(closedAtMs) : undefined;
      const records = await connector.getClosedPnl!(exchangeSymbol, creds, startArg, endArg);
      const metrics = computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs, {
        tradeSide: String(lt.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        // Bybit, CoinDCX and Hyperliquid all carry the order id on their
        // PnL rows; prefer exact id match over the wide CoinDCX/Bybit time
        // window so PnL never gets attributed to the wrong trade when
        // several closes land near each other.
        matchAnyOrderId:
          exchange === "BYBIT" || exchange === "COINDCX" || exchange === "HYPERLIQUID"
            ? exchangeReconcileOrderIdsFromLiveTrade(lt as unknown as Record<string, unknown>)
            : undefined,
        ...(exchange === "COINDCX" ? coindcxClosedPnlWindowOpts() : {}),
        ...(exchange === "BYBIT" ? bybitClosedPnlWindowOpts() : {}),
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

  // Cold-path rebuild: bulk reconcile is the natural place to refresh the
  // cached deployment aggregates from the (now up-to-date) live_trades. This
  // heals any drift from missed deltas, manual overrides, or legacy rows.
  try {
    await rebuildDeploymentAggregates(db, uid, exchange);
  } catch (e) {
    result.errors.push(
      `aggregate-rebuild: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return result;
}
