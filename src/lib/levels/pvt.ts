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
 *   •  0  choppy / no net volume-weighted drift
 * Scale-free (the volume magnitude cancels), so it compares cleanly across a
 * quiet index and a jumpy midcap. Returns null when there isn't enough history.
 */
export function pvtSlopeSignal(points: PvtPoint[], window = 20): number | null {
  if (points.length < 3) return null;
  const slice = points.slice(-Math.max(2, window + 1));
  if (slice.length < 3) return null;
  const net = slice[slice.length - 1]!.value - slice[0]!.value;
  let totalAbs = 0;
  for (let i = 1; i < slice.length; i++) {
    totalAbs += Math.abs(slice[i]!.value - slice[i - 1]!.value);
  }
  if (totalAbs === 0) return 0;
  return Math.max(-1, Math.min(1, net / totalAbs));
}
