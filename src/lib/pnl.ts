/**
 * Shared PNL calculation utility for the tp1/tp2 exit strategy.
 *
 * Strategy:
 *   - tp1 hit → book 50% at tp1, move SL to cost
 *   - tp2 hit → book remaining 50% at tp2, trade fully closed
 *   - SL hit → close remaining position at SL
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
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp1BookedPnl?: number | null;
  tp2BookedPnl?: number | null;
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
 * Returns the effective PNL for a signal based on the tp1/tp2 strategy.
 *
 * - Fully closed (totalBookedPnl set): returns totalBookedPnl
 * - tp1 hit, still active: tp1BookedPnl + unrealized on remaining 50%
 * - No targets hit, still active: unrealized on full position
 */
export function getEffectivePnl(signal: SignalForPnl): number {
  const entry = Number(signal.price || 0);
  const current = signal.currentPrice != null ? Number(signal.currentPrice) : entry;

  if (signal.totalBookedPnl != null) {
    return signal.totalBookedPnl;
  }

  if (signal.tp1Hit && signal.tp1BookedPnl != null) {
    const unrealizedOnRemaining = rawPnlPercent(current, entry, signal.type) * 0.5;
    return signal.tp1BookedPnl + unrealizedOnRemaining;
  }

  return rawPnlPercent(current, entry, signal.type);
}

/**
 * Calculate the booked PNL for a partial exit (50% of position).
 */
export function calcBookedPnl(
  targetPrice: number,
  entryPrice: number,
  type: string,
  positionFraction: number = 0.5
): number {
  return rawPnlPercent(targetPrice, entryPrice, type) * positionFraction;
}
