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
 * Derive TP3 from TP1 and TP2 (uniform ATR spacing).
 */
export function deriveTp3(tp1: number, tp2: number): number {
  return tp2 + (tp2 - tp1);
}
