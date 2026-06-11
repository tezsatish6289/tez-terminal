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

const PUBLIC_LEVELS_CHART_HOSTS = new Set([
  "fnoninja.com",
  "www.fnoninja.com",
  "freedombot.ai",
  "www.freedombot.ai",
]);

/** Public chart path — production domains use /levels/chart; dev uses /freedombot/levels/chart. */
export function levelsChartPagePathForHost(
  hostname: string,
  scope: LevelsTvScope,
  symbol: string,
): string {
  const h = hostname.toLowerCase();
  const q = levelsChartQuery(scope, symbol);
  if (PUBLIC_LEVELS_CHART_HOSTS.has(h)) {
    return `/levels/chart?${q}`;
  }
  return `/freedombot/levels/chart?${q}`;
}

/** Full bubble-map levels page — fnoninja.com uses /levels; others use /freedombot/levels. */
export function levelsBubblesPagePathForHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h === "fnoninja.com" || h === "www.fnoninja.com") {
    return "/levels";
  }
  return "/freedombot/levels";
}
