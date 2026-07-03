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
