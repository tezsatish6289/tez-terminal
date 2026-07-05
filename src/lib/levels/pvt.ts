/** Calendar days of daily history for PVT (~6 months). */
export const PVT_LOOKBACK_DAYS = 183;

export interface PvtInputCandle {
  time: number;
  close: number;
  volume?: number;
}

export interface PvtPoint {
  time: number;
  value: number;
}

/**
 * Price Volume Trend — cumulative from zero at the first bar in the series.
 * PVT[i] = PVT[i-1] + volume[i] × (close[i] - close[i-1]) / close[i-1]
 */
export function computePvt(candles: PvtInputCandle[]): PvtPoint[] {
  if (candles.length === 0) return [];
  const out: PvtPoint[] = [{ time: candles[0]!.time, value: 0 }];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const prevClose = prev.close;
    let next = out[i - 1]!.value;
    if (Number.isFinite(prevClose) && prevClose !== 0) {
      const pct = (cur.close - prevClose) / prevClose;
      next += (Number(cur.volume) || 0) * pct;
    }
    out.push({ time: cur.time, value: next });
  }
  return out;
}

/**
 * Normalised PVT trend signal in [-1, +1] over the last `window` intervals — an
 * efficiency ratio: net change ÷ total absolute movement. PVT itself is a
 * cumulative, unbounded series whose raw level is meaningless across symbols, so
 * we score its recent *direction and consistency* instead:
 *   • +1  steady volume-backed accumulation (bullish)
 *   • −1  steady distribution (bearish)
 *   •  0  choppy — real volume, but no net volume-weighted drift
 * Scale-free (the volume magnitude cancels), so it compares cleanly across a
 * quiet index and a jumpy midcap.
 *
 * Returns null when there isn't enough history OR the series is perfectly flat.
 * A flat PVT means there was no usable volume (NSE indices report zero volume,
 * so their candles yield a flat series) — that's "no signal", NOT a confident
 * neutral, so we exclude it and let the scorer renormalise over its other
 * signals rather than dampening the read with a spurious 0.
 */
export function pvtSlopeSignal(points: PvtPoint[], window = 20): number | null {
  if (points.length < 3) return null;
  const slice = points.slice(-Math.max(2, window + 1));
  if (slice.length < 3) return null;
  return efficiency(slice);
}

/**
 * Event-anchored PVT signal in [-1, +1] — the same efficiency ratio, but the
 * window starts at the "toe-dip" (when price entered a cluster) instead of a
 * fixed trailing lookback. This is the meaningful frame for a zone-entry system:
 * what matters is whether volume has confirmed the thesis *since the dip*, not
 * over an arbitrary 20-day window that can be dominated by irrelevant pre-dip
 * trend. Directionally it needs no side-gating — PVT rising since the dip is
 * bullish and falling is bearish regardless of which cluster was tagged:
 *   • support dip + rising  → accumulation confirms the bounce   → +
 *   • support dip + falling → distribution warns of breakdown    → −
 *   • resistance dip + rising → pressure warns of breakout        → +
 *   • resistance dip + falling → distribution confirms rejection  → −
 *
 * `anchorTimeSec` is epoch-seconds (same unit as {@link PvtPoint.time}); we
 * anchor to the bar at/just before it (the dip-day session) so the delta spans
 * dip-day → now. Confirmation accrues: a same-day dip has ≤1 bar since entry and
 * returns null (no signal yet), strengthening as sessions pass. Also null when
 * the anchored series is flat (no usable volume, e.g. NSE indices).
 *
 * The window end is capped by whichever of these is tighter (both optional):
 *   • `untilTimeSec` — stop at the bar at/before this epoch-seconds (e.g. the
 *     exit/resolvedAt, so a resolved trade reads entry→exit not entry→today).
 *   • `maxSessions`  — stop N bars after the dip (calibration freezes an early,
 *     look-ahead-free reading; the live badge leaves both unset → entry→now).
 */
export function pvtSlopeSince(
  points: PvtPoint[],
  anchorTimeSec: number,
  opts: { minBars?: number; maxSessions?: number; untilTimeSec?: number } = {},
): number | null {
  const minBars = Math.max(2, opts.minBars ?? 2);
  if (points.length === 0 || !Number.isFinite(anchorTimeSec)) return null;
  // Anchor = the last session at/just before the dip (the dip-day bar). If the
  // dip predates all history, fall back to the first available bar.
  let anchorIdx = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.time <= anchorTimeSec) anchorIdx = i;
    else break;
  }
  let endIdx = points.length - 1;
  if (opts.untilTimeSec != null && Number.isFinite(opts.untilTimeSec)) {
    let e = anchorIdx;
    for (let i = anchorIdx; i < points.length; i++) {
      if (points[i]!.time <= opts.untilTimeSec) e = i;
      else break;
    }
    endIdx = e;
  }
  if (opts.maxSessions != null) {
    endIdx = Math.min(endIdx, anchorIdx + Math.max(1, opts.maxSessions));
  }
  const slice = points.slice(anchorIdx, endIdx + 1);
  if (slice.length < minBars) return null;
  return efficiency(slice);
}

/** Signed efficiency ratio (net drift ÷ total absolute movement) of a PVT slice. */
function efficiency(slice: PvtPoint[]): number | null {
  const net = slice[slice.length - 1]!.value - slice[0]!.value;
  let totalAbs = 0;
  for (let i = 1; i < slice.length; i++) {
    totalAbs += Math.abs(slice[i]!.value - slice[i - 1]!.value);
  }
  if (totalAbs === 0) return null; // flat series → no volume → no usable signal
  return Math.max(-1, Math.min(1, net / totalAbs));
}
