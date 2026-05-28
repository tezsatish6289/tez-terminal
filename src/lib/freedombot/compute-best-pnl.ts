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
 *                    (exchangeRealizedPnl, NET of fees on every venue we
 *                    integrate with — Bybit `closedPnl`, CoinDCX `amount`
 *                    on transactions, Hyperliquid `closedPnl` on fills).
 *   3. "events"    – sum of (priceDiff × qty) across every closing fill in
 *                    the trade's `events` array, MINUS the per-event fees
 *                    accumulated at runtime so the result is also NET.
 *                    Correctly accounts for partial closes (e.g. 20% TP1
 *                    + 80% trailing SL).
 *   4. "prices"    – single-shot estimate from (entry, exit, positionSize)
 *                    MINUS the stored `fees` total (or an estimated round-
 *                    trip fee when `fees` is missing). Used when events
 *                    aren't available.
 *   5. "internal"  – stored realizedPnl minus stored fees (NET).
 *                    Last-resort defensive fallback; reached only when
 *                    none of the above are available.
 *
 * NET-of-fees convention (introduced May 2026):
 *   Previously paths 3/4/5 returned GROSS P&L while path 2 returned NET.
 *   Closed-trade dashboards would jump downward by `~0.11%` of notional
 *   the moment exchange truth landed — visible to users as "lifetime PnL
 *   randomly decreased by $1.23 even though no trade closed". Now every
 *   path returns NET so the displayed value converges smoothly toward
 *   the venue's authoritative number (drift on convergence ≈ the gap
 *   between our flat 0.055% taker estimate and the user's actual VIP
 *   tier fee, usually < 0.02% of notional).
 *
 * For trades closed *before* the leverage-fix commit (Nov 2026), priorities
 * 3 and 4 deliberately recompute from raw inputs instead of trusting the
 * stored realizedPnl, because that field was inflated by ~10× back then.
 */

type AnyEvent = {
  type?: unknown;
  price?: unknown;
  quantity?: unknown;
  fee?: unknown;
};

export type TradeForPnl = {
  side?: string | null;
  entryPrice?: number | null;
  currentPrice?: number | null;
  exchangeAvgExitPrice?: number | null;
  positionSize?: number | null;
  events?: unknown;
  realizedPnl?: number | null;
  /** Stored runtime fee accumulator (entry + per-event close fees). Used to
   *  return NET P&L from the `prices` / `internal` fallback paths so they
   *  match the convention used by `exchange` and `events`. */
  fees?: number | null;
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

/** Approximate round-trip taker fee, used only when a trade has no
 *  `fees` accumulator (legacy rows, pre-cleanup trades). Matches the
 *  `SIM_CONFIG.EXCHANGE_FEE` value used at runtime so the estimate is
 *  internally consistent; per-venue VIP tiers may differ slightly.
 *  Hard-coded here (vs imported) to keep `compute-best-pnl` free of
 *  server-only imports — it runs on the client too. */
const EST_ROUND_TRIP_FEE_RATE = 0.00055 * 2;

const isLongSide = (side: string | null | undefined): boolean =>
  side === "BUY" || side === "LONG";

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const nonNegNumOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n != null && n >= 0 ? n : null;
};

/**
 * Recompute realised P&L from the trade's event log:
 *   Σ (eventPrice − entry) × eventQty × sideSign − Σ event fees
 *
 * Returns NET (after fees) so it lines up with the venue-reported
 * `exchangeRealizedPnl`. Works correctly for any number of partial closes;
 * returns null only if we have no usable closing events at all.
 */
export function computePnlFromEvents(t: TradeForPnl): number | null {
  const entry = numOrNull(t.entryPrice);
  if (entry == null || entry <= 0) return null;
  if (!Array.isArray(t.events) || t.events.length === 0) return null;
  const isLong = isLongSide(t.side ?? null);

  let gross = 0;
  let feeFromEvents = 0;
  let counted = 0;
  for (const raw of t.events as AnyEvent[]) {
    if (!raw || typeof raw !== "object") continue;
    // Sum fee from ALL event types (entry's OPEN event and every close
    // event each carry their own fee) so the result is a true round-trip
    // net figure.
    const fee = nonNegNumOrNull(raw.fee);
    if (fee != null) feeFromEvents += fee;
    if (!CLOSING_EVENT_TYPES.has(String(raw.type))) continue;
    const px = numOrNull(raw.price);
    const qty = numOrNull(raw.quantity);
    if (px == null || qty == null || qty <= 0) continue;
    const diff = isLong ? px - entry : entry - px;
    gross += diff * qty;
    counted++;
  }
  if (counted === 0) return null;

  // Prefer the trade's own `fees` accumulator when present (it's the
  // authoritative runtime total — matches what the engine actually
  // debited). Fall back to the event-by-event sum we just built, then
  // to a notional-based estimate. The three sources agree within rounding
  // for a normal trade; the layered fallback just keeps NET well-defined
  // for legacy rows where one source went missing.
  const storedFee = nonNegNumOrNull(t.fees);
  const fee =
    storedFee != null
      ? storedFee
      : feeFromEvents > 0
        ? feeFromEvents
        : Math.abs(numOrNull(t.positionSize) ?? 0) * EST_ROUND_TRIP_FEE_RATE;

  return gross - fee;
}

/**
 * Single-shot fallback when the events array isn't present. Treats the
 * whole position as if it closed at the last recorded price, then nets
 * out fees (stored accumulator preferred, else round-trip estimate).
 */
export function computePnlFromPrices(t: TradeForPnl): number | null {
  const entry = numOrNull(t.entryPrice);
  const exit = numOrNull(t.exchangeAvgExitPrice) ?? numOrNull(t.currentPrice);
  const size = numOrNull(t.positionSize);
  if (entry == null || exit == null || size == null) return null;
  if (entry <= 0 || size <= 0) return null;
  const isLong = isLongSide(t.side ?? null);
  const gross = isLong ? size * (exit / entry - 1) : size * (1 - exit / entry);

  const storedFee = nonNegNumOrNull(t.fees);
  const fee = storedFee != null ? storedFee : size * EST_ROUND_TRIP_FEE_RATE;
  return gross - fee;
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
  if (internal == null) return null;
  // NET the legacy stored value too so the source-change jump is the
  // same magnitude regardless of which fallback we landed on.
  const storedFee = nonNegNumOrNull(t.fees) ?? 0;
  return { value: internal - storedFee, source: "internal" };
}
