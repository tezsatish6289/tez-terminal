import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export type LevelsChartView = "chart" | "outlook" | "history";

function levelsChartQuery(
  scope: LevelsTvScope,
  symbol: string,
  expiryKey?: string | null,
  view?: LevelsChartView | null,
): string {
  const params = new URLSearchParams({
    scope,
    symbol: symbol.trim().toUpperCase(),
  });
  if (expiryKey) params.set("expiry", expiryKey);
  if (view && view !== "chart") params.set("view", view);
  return params.toString();
}

/** Opens in a new browser tab from the bubbles map (localhost dev paths). */
export function levelsChartPagePath(
  scope: LevelsTvScope,
  symbol: string,
  expiryKey?: string | null,
  view?: LevelsChartView | null,
): string {
  return `/fnoninja/levels/chart?${levelsChartQuery(scope, symbol, expiryKey, view)}`;
}

const FNONINJA_LEVELS_HOSTS = new Set(["fnoninja.com", "www.fnoninja.com"]);
const FREEDOMBOT_LEVELS_DEPRECATED_HOSTS = new Set(["freedombot.ai", "www.freedombot.ai"]);

/** Public chart path — fnoninja.com uses /levels/chart; freedombot.ai redirects to fnoninja.com. */
export function levelsChartPagePathForHost(
  hostname: string,
  scope: LevelsTvScope,
  symbol: string,
  expiryKey?: string | null,
  view?: LevelsChartView | null,
): string {
  const h = hostname.toLowerCase();
  const q = levelsChartQuery(scope, symbol, expiryKey, view);
  if (FNONINJA_LEVELS_HOSTS.has(h)) {
    return `/levels/chart?${q}`;
  }
  if (FREEDOMBOT_LEVELS_DEPRECATED_HOSTS.has(h)) {
    return `${FNONINJA_SITE_URL}/levels/chart?${q}`;
  }
  return `/fnoninja/levels/chart?${q}`;
}

/** Bubble-map levels page — fnoninja.com /levels; freedombot.ai → fnoninja.com; dev → /fnoninja/levels. */
export function levelsBubblesPagePathForHost(hostname: string): string {
  const h = hostname.toLowerCase();
  if (FNONINJA_LEVELS_HOSTS.has(h)) {
    return "/levels";
  }
  if (FREEDOMBOT_LEVELS_DEPRECATED_HOSTS.has(h)) {
    return `${FNONINJA_SITE_URL}/levels`;
  }
  return "/fnoninja/levels";
}
