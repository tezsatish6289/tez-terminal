import type { SimulatorState } from "@/lib/simulator";

/** Reject manual entries this far from the live reference price. */
export const MAX_ENTRY_MARKET_DEVIATION = 0.25;

export function entryMarketDeviationPct(
  entryPrice: number,
  livePrice: number,
): number | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(livePrice) || livePrice <= 0) return null;
  return Math.abs(entryPrice - livePrice) / livePrice;
}

export function validateEntryVsMarket(
  entryPrice: number,
  livePrice: number | null,
  maxDeviation = MAX_ENTRY_MARKET_DEVIATION,
): string | null {
  if (livePrice == null) return null;
  const dev = entryMarketDeviationPct(entryPrice, livePrice);
  if (dev == null) return null;
  if (dev > maxDeviation) {
    return `Entry $${entryPrice} is ${(dev * 100).toFixed(1)}% away from market $${livePrice.toFixed(4)} (max ${(maxDeviation * 100).toFixed(0)}%)`;
  }
  return null;
}

/** Cap sizing capital so one corrupted simState row cannot open $M positions. */
export function effectiveCapitalForSizing(state: SimulatorState): number {
  const starting =
    typeof state.startingCapital === "number" && state.startingCapital > 0
      ? state.startingCapital
      : 1000;
  const cap = starting * 5;
  return Math.min(Math.max(0, state.capital), cap);
}

/** Ignore absurd per-trade PnL when rebuilding simState from history. */
export function clampTradeRealizedPnlForReconcile(
  pnl: number,
  startingCapital: number,
): number {
  if (!Number.isFinite(pnl)) return 0;
  const cap = Math.max(startingCapital * 5, 5000);
  return Math.max(-cap, Math.min(cap, pnl));
}

/** When entry was punched off-market, kill-switch must not credit live-price PnL. */
export function killSwitchExitPrice(
  entryPrice: number,
  livePrice: number,
  maxDeviation = MAX_ENTRY_MARKET_DEVIATION,
): number {
  const dev = entryMarketDeviationPct(entryPrice, livePrice);
  if (dev != null && dev > maxDeviation) return entryPrice;
  return livePrice;
}
