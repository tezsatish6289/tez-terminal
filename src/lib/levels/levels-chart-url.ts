import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

/** Opens in a new browser tab from the bubbles map. */
export function levelsChartPagePath(scope: LevelsTvScope, symbol: string): string {
  const params = new URLSearchParams({
    scope,
    symbol: symbol.trim().toUpperCase(),
  });
  return `/freedombot/levels/chart?${params.toString()}`;
}
