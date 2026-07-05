"use client";

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import { isSlideshowZoneStale } from "@/lib/levels/slideshow-zones";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

type CacheEntry = {
  data: PublicLevels | null;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PublicLevels | null>>();

export function slideshowLevelsCacheKey(scope: LevelsTvScope, symbol: string): string {
  return `${scope}:${symbol.trim().toUpperCase()}`;
}

export function getSlideshowLevelsCache(
  scope: LevelsTvScope,
  symbol: string,
): PublicLevels | null | undefined {
  const hit = cache.get(slideshowLevelsCacheKey(scope, symbol));
  if (!hit) return undefined;
  if (hit.data && isSlideshowZoneStale(hit.data.computedAt)) return undefined;
  return hit.data;
}

/** Fetch levels once; reuse for active slide + prefetch of the next symbol. */
export function prefetchSlideshowLevels(
  scope: LevelsTvScope,
  symbol: string,
): Promise<PublicLevels | null> {
  const key = slideshowLevelsCacheKey(scope, symbol);
  const cached = getSlideshowLevelsCache(scope, symbol);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchSymbolLevels(scope, symbol, { slideshow: true })
    .then((json) => {
      cache.set(key, { data: json.data, fetchedAt: Date.now() });
      return json.data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function primeSlideshowLevelsCache(
  scope: LevelsTvScope,
  symbol: string,
  data: PublicLevels | null,
): void {
  cache.set(slideshowLevelsCacheKey(scope, symbol), { data, fetchedAt: Date.now() });
}
