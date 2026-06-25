import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

/** Per-symbol levels API — chart deep-dive, liveslide, favslide. */
export function symbolLevelsApiUrl(
  scope: LevelsTvScope,
  symbol: string,
  opts?: { slideshow?: boolean; refresh?: boolean },
): string {
  const params = new URLSearchParams({ symbol });
  if (scope === "index") params.set("scope", "index");
  if (opts?.slideshow) params.set("slideshow", "1");
  if (opts?.refresh) params.set("refresh", "1");
  return `/api/freedombot/levels?${params.toString()}`;
}
