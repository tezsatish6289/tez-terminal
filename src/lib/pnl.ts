/**
 * Shared PNL calculation utility for the tp1/tp2/tp3 exit strategy.
 *
 * Strategy (50/25/25 split):
 *   - tp1 hit → book 50% at tp1, move SL to cost
 *   - tp2 hit → book 25% at tp2, move SL to tp1
 *   - tp3 hit → book remaining 25% at tp3, trade fully closed
 *   - SL hit → close remaining position at current SL level
 *
 * tp3 is derived: tp3 = tp2 + (tp2 - tp1)   [uniform 3-ATR spacing]
 *
 * All values are raw percentages (no leverage).
 * Leverage is applied at the display/analytics layer.
 */

export interface SignalForPnl {
  price: number;
  currentPrice?: number | null;
  type: string; // "BUY" | "SELL"
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  tp1BookedPnl?: number | null;
  tp2BookedPnl?: number | null;
  tp3BookedPnl?: number | null;
  slBookedPnl?: number | null;
  totalBookedPnl?: number | null;
  status?: string;
}

export function rawPnlPercent(
  exitPrice: number | undefined | null,
  entryPrice: number,
  type: string
): number {
  if (exitPrice == null || !entryPrice || entryPrice === 0) return 0;
  const diff = type === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (diff / entryPrice) * 100;
}

/**
 * Returns the effective PNL for a signal based on the tp1/tp2/tp3 strategy.
 *
 * - Fully closed (totalBookedPnl set): returns totalBookedPnl
 * - tp2 hit, still active: tp1BookedPnl + tp2BookedPnl + unrealized on remaining 25%
 * - tp1 hit, still active: tp1BookedPnl + unrealized on remaining 50%
 * - No targets hit, still active: unrealized on full position
 */
export function getEffectivePnl(signal: SignalForPnl): number {
  const entry = Number(signal.price || 0);
  const current = signal.currentPrice != null ? Number(signal.currentPrice) : entry;

  if (signal.totalBookedPnl != null) {
    return signal.totalBookedPnl;
  }

  if (signal.tp2Hit && signal.tp2BookedPnl != null && signal.tp1BookedPnl != null) {
    const unrealizedOnRemaining = rawPnlPercent(current, entry, signal.type) * 0.25;
    return signal.tp1BookedPnl + signal.tp2BookedPnl + unrealizedOnRemaining;
  }

  if (signal.tp1Hit && signal.tp1BookedPnl != null) {
    const unrealizedOnRemaining = rawPnlPercent(current, entry, signal.type) * 0.5;
    return signal.tp1BookedPnl + unrealizedOnRemaining;
  }

  return rawPnlPercent(current, entry, signal.type);
}

/**
 * Calculate the booked PNL for a partial exit.
 */
export function calcBookedPnl(
  targetPrice: number,
  entryPrice: number,
  type: string,
  positionFraction: number
): number {
  return rawPnlPercent(targetPrice, entryPrice, type) * positionFraction;
}

/**
 * Validate that TP levels are directionally consistent with the signal type.
 * BUY: tp1 > entry, tp2 > tp1 (ascending targets above entry)
 * SELL: tp1 < entry, tp2 < tp1 (descending targets below entry)
 */
export function areTpsValid(
  type: string,
  entryPrice: number,
  tp1: number,
  tp2: number
): boolean {
  if (!entryPrice || !tp1 || !tp2) return false;
  if (type === "BUY") return tp1 > entryPrice && tp2 > tp1;
  return tp1 < entryPrice && tp2 < tp1;
}

/**
 * Max allowed raw (unleveraged) TP distance from entry, per timeframe.
 * Scalping (5m): 3%, Intraday (15m): 5%, BTST (60m): 8%, Swing (240m): 12%, Positional (D): 20%
 */
const MAX_TP_DISTANCE: Record<string, number> = {
  "1": 2, "5": 3, "15": 5, "60": 8, "240": 12, "D": 20,
};

/**
 * Check if TP1 distance from entry is within a sane range for the given timeframe.
 * Rejects signals where TPs are irrationally far from entry.
 */
export function areTpDistancesSane(
  entryPrice: number,
  tp1: number,
  timeframe: string
): boolean {
  if (!entryPrice || !tp1) return true;
  const pctDistance = Math.abs(tp1 - entryPrice) / entryPrice * 100;
  const maxDistance = MAX_TP_DISTANCE[timeframe] ?? 15;
  return pctDistance <= maxDistance;
}

/**
 * Derive TP3 from TP1 and TP2 (uniform ATR spacing).
 */
export function deriveTp3(tp1: number, tp2: number): number {
  return tp2 + (tp2 - tp1);
}

/**
 * Derive TP1/TP2/TP3 from SL distance when incoming TPs are invalid.
 * Uses fixed risk-reward multiples: 1.5R, 2.5R, 3.5R.
 */
export function deriveTpsFromRisk(
  type: string,
  entryPrice: number,
  stopLoss: number,
): { tp1: number; tp2: number; tp3: number } | null {
  if (!entryPrice || !stopLoss || entryPrice === stopLoss) return null;

  const slDistance = Math.abs(entryPrice - stopLoss);
  const dir = type === "BUY" ? 1 : -1;

  return {
    tp1: entryPrice + dir * slDistance * 1.5,
    tp2: entryPrice + dir * slDistance * 2.5,
    tp3: entryPrice + dir * slDistance * 3.5,
  };
}
