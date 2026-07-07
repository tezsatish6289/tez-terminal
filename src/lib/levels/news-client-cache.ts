"use client";

/**
 * Session-lived client cache for AI-grounded levels news.
 *
 * The server already caches news in Firestore (8h fresh / 3d stale) so the slow
 * grounded generation never runs per view. This client cache stops the *browser*
 * from re-requesting on every panel mount: the news drawer lives inside a Sheet
 * that unmounts on close, so without this each reopen showed a spinner and a
 * fresh round-trip. Shared across the levels toolbar and the broadcast rail.
 */

import type { LevelsNews } from "@/lib/levels/news-types";
import { LEVELS_NEWS_WINDOW_DAYS, type NewsWindow } from "@/lib/levels/news-types";

type Scope = "stock" | "index";

const newsCache = new Map<string, LevelsNews>();
const inflight = new Map<string, Promise<LevelsNews | null>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cacheKey(scope: Scope, symbol: string, window: NewsWindow): string {
  return `nw:${scope}:${symbol}:${window}`;
}

/** Session-cached news for a symbol, or null if not fetched yet. Synchronous. */
export function cachedLevelsNews(
  scope: Scope,
  symbol: string,
  window: NewsWindow = LEVELS_NEWS_WINDOW_DAYS,
): LevelsNews | null {
  return newsCache.get(cacheKey(scope, symbol, window)) ?? null;
}

/**
 * Fetch AI-grounded news, reusing the session cache and de-duping concurrent
 * callers. Retries transient failures with backoff (cold generation is slow and
 * can 5xx). `force` bypasses the cached value and re-requests from the server
 * (used by the manual refresh button); the fresh result replaces the cache.
 */
export async function fetchLevelsNews(
  scope: Scope,
  symbol: string,
  opts?: { window?: NewsWindow; force?: boolean },
): Promise<LevelsNews | null> {
  const window = opts?.window ?? LEVELS_NEWS_WINDOW_DAYS;
  const k = cacheKey(scope, symbol, window);

  if (!opts?.force) {
    const cached = newsCache.get(k);
    if (cached) return cached;
    const existing = inflight.get(k);
    if (existing) return existing;
  }

  const p = (async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(
          `/api/freedombot/levels/news?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}&window=${window}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok: boolean; news?: LevelsNews };
        if (json.ok && json.news) {
          newsCache.set(k, json.news);
          return json.news;
        }
      } catch {
        /* retry below */
      }
      if (attempt < MAX_ATTEMPTS - 1) await sleep(5000 + attempt * 4000);
    }
    return null;
  })().finally(() => {
    // Only the owning promise clears the slot (a forced refetch may overwrite it).
    if (inflight.get(k) === p) inflight.delete(k);
  });
  inflight.set(k, p);
  return p;
}
