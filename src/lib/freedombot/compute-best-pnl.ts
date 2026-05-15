/**
 * Single source of truth for "what number should we show as realised P&L"
 * for one closed trade, with provenance.
 *
 * Used by:
 *   - GET /api/freedombot/my-trades        (per-row value sent to dashboard)
 *   - sumLifetimeRealizedPnlForUserExchange (admin lifetime header)
 *   - dashboard preliminary/verified styling (via the returned source label)
 *
 * Priority order (first hit wins):
 *
 *   1. "override"  – manual admin correction (exchangeRealizedPnlOverride)
 *   2. "exchange"  – realised P&L pulled from the venue API
 *                    (exchangeRealizedPnl, net of fees)
 *   3. "events"    – sum of (priceDiff × qty) across every closing fill in
 *                    the trade's `events` array. Exact reconstruction of
 *                    the same per-event math the engine performs at runtime,
 *                    but recomputed from immutable event data so it is
 *                    robust against the historical leverage-inflation bug.
 *                    Correctly accounts for partial closes (e.g. 20% TP1
 *                    + 80% trailing SL).
 *   4. "prices"    – single-shot estimate from (entry, exit, positionSize).
 *                    Treats the position as if 100% closed at the last
 *                    recorded price. Used when events aren't available.
 *   5. "internal"  – stored realizedPnl. Last-resort defensive fallback;
 *                    reached only when none of the above are available.
 *
 * For trades closed *before* the leverage-fix commit (Nov 2026), priorities
 * 3 and 4 deliberately recompute from raw inputs instead of trusting the
 * stored realizedPnl, because that field was inflated by ~10× back then.
 */

type AnyEvent = {
  type?: unknown;
  price?: unknown;
  quantity?: unknown;
};

export type TradeForPnl = {
  side?: string | null;
  entryPrice?: number | null;
  currentPrice?: number | null;
  exchangeAvgExitPrice?: number | null;
  positionSize?: number | null;
  events?: unknown;
  realizedPnl?: number | null;
  exchangeRealizedPnl?: number | null;
  exchangeRealizedPnlOverride?: number | null;
};

export type RealizedPnlSource =
  | "override"
  | "exchange"
  | "events"
  | "prices"
  | "internal";

/** Event types that represent an actual close fill (have a non-zero qty). */
const CLOSING_EVENT_TYPES = new Set<string>([
  "TP1",
  "TP2",
  "TP3",
  "SL",
  "TRAILING_SL",
  "KILL_SWITCH",
  "MARKET_TURN",
  "SCORE_DEGRADED",
  "PATTERN_BREAK",
]);

const isLongSide = (side: string | null | undefined): boolean =>
  side === "BUY" || side === "LONG";

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Recompute realised P&L from the trade's event log:
 *   Σ (eventPrice − entry) × eventQty × sideSign
 *
 * Works correctly for any number of partial closes; returns null only if
 * we have no usable closing events at all.
 */
export function computePnlFromEvents(t: TradeForPnl): number | null {
  const entry = numOrNull(t.entryPrice);
  if (entry == null || entry <= 0) return null;
  if (!Array.isArray(t.events) || t.events.length === 0) return null;
  const isLong = isLongSide(t.side ?? null);

  let total = 0;
  let counted = 0;
  for (const raw of t.events as AnyEvent[]) {
    if (!raw || typeof raw !== "object") continue;
    if (!CLOSING_EVENT_TYPES.has(String(raw.type))) continue;
    const px = numOrNull(raw.price);
    const qty = numOrNull(raw.quantity);
    if (px == null || qty == null || qty <= 0) continue;
    const diff = isLong ? px - entry : entry - px;
    total += diff * qty;
    counted++;
  }
  return counted > 0 ? total : null;
}

/**
 * Single-shot fallback when the events array isn't present. Treats the
 * whole position as if it closed at the last recorded price.
 */
export function computePnlFromPrices(t: TradeForPnl): number | null {
  const entry = numOrNull(t.entryPrice);
  const exit = numOrNull(t.exchangeAvgExitPrice) ?? numOrNull(t.currentPrice);
  const size = numOrNull(t.positionSize);
  if (entry == null || exit == null || size == null) return null;
  if (entry <= 0 || size <= 0) return null;
  const isLong = isLongSide(t.side ?? null);
  return isLong ? size * (exit / entry - 1) : size * (1 - exit / entry);
}

export interface BestRealizedPnl {
  value: number;
  source: RealizedPnlSource;
}

export function bestRealizedPnl(t: TradeForPnl): BestRealizedPnl | null {
  const ov = numOrNull(t.exchangeRealizedPnlOverride);
  if (ov != null) return { value: ov, source: "override" };

  const ex = numOrNull(t.exchangeRealizedPnl);
  if (ex != null) return { value: ex, source: "exchange" };

  const fromEvents = computePnlFromEvents(t);
  if (fromEvents != null) return { value: fromEvents, source: "events" };

  const fromPrices = computePnlFromPrices(t);
  if (fromPrices != null) return { value: fromPrices, source: "prices" };

  const internal = numOrNull(t.realizedPnl);
  if (internal != null) return { value: internal, source: "internal" };

  return null;
}
