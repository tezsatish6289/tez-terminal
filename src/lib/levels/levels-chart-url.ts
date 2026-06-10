import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

function levelsChartQuery(scope: LevelsTvScope, symbol: string): string {
  const params = new URLSearchParams({
    scope,
    symbol: symbol.trim().toUpperCase(),
  });
  return params.toString();
}

/** Opens in a new browser tab from the bubbles map (dev / tezterminal paths). */
export function levelsChartPagePath(scope: LevelsTvScope, symbol: string): string {
  return `/freedombot/levels/chart?${levelsChartQuery(scope, symbol)}`;
}

/** Public chart path — fnoninja.com uses /levels/chart; others use /freedombot/levels/chart. */
export function levelsChartPagePathForHost(
  hostname: string,
  scope: LevelsTvScope,
  symbol: string,
): string {
  const h = hostname.toLowerCase();
  const q = levelsChartQuery(scope, symbol);
  if (h === "fnoninja.com" || h === "www.fnoninja.com") {
    return `/levels/chart?${q}`;
  }
  return `/freedombot/levels/chart?${q}`;
}
