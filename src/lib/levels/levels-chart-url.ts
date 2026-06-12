import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

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

const FNONINJA_LEVELS_HOSTS = new Set(["fnoninja.com", "www.fnoninja.com"]);
const FREEDOMBOT_LEVELS_DEPRECATED_HOSTS = new Set(["freedombot.ai", "www.freedombot.ai"]);

/** Public chart path — fnoninja.com uses /levels/chart; freedombot.ai redirects to fnoninja.com. */
export function levelsChartPagePathForHost(
  hostname: string,
  scope: LevelsTvScope,
  symbol: string,
): string {
  const h = hostname.toLowerCase();
  const q = levelsChartQuery(scope, symbol);
  if (FNONINJA_LEVELS_HOSTS.has(h)) {
    return `/levels/chart?${q}`;
  }
  if (FREEDOMBOT_LEVELS_DEPRECATED_HOSTS.has(h)) {
    return `${FNONINJA_SITE_URL}/levels/chart?${q}`;
  }
  return `/freedombot/levels/chart?${q}`;
}

/** Bubble-map levels page — fnoninja.com /levels; freedombot.ai → fnoninja.com; dev → /freedombot/levels. */
export function levelsBubblesPagePathForHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (FNONINJA_LEVELS_HOSTS.has(h)) {
    return "/levels";
  }
  if (FREEDOMBOT_LEVELS_DEPRECATED_HOSTS.has(h)) {
    return `${FNONINJA_SITE_URL}/levels`;
  }
  return "/freedombot/levels";
}
