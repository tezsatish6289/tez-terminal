/**
 * Session-lived caches + prefetch for the broadcast page.
 *
 * The stream runs for an hour with the same browser open, cycling a fixed set
 * of symbols repeatedly. We cache the slow per-symbol calls (levels ladder +
 * AI news) in memory so a symbol only pays the latency once, and we warm the
 * NEXT symbol's data (levels, news, candles) in the background before the
 * fade-over so each page paints instantly.
 */

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelsNews } from "@/lib/levels/news-types";
import { LEVELS_NEWS_WINDOW_DAYS } from "@/lib/levels/news-types";

type Scope = "stock" | "index";

const levelsCache = new Map<string, PublicLevels>();
const newsCache = new Map<string, LevelsNews>();
const candlesWarmed = new Set<string>();
const inflight = new Map<string, Promise<unknown>>();

function key(scope: Scope, symbol: string): string {
  return `${scope}:${symbol}`;
}

/** Per-symbol levels ladder (clusters + strikes). Cached after first fetch. */
export async function fetchLevels(
  scope: Scope,
  symbol: string,
): Promise<PublicLevels | null> {
  const k = `lv:${key(scope, symbol)}`;
  const cached = levelsCache.get(k);
  if (cached) return cached;

  const existing = inflight.get(k) as Promise<PublicLevels | null> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(
        `/api/freedombot/levels?symbol=${encodeURIComponent(symbol)}&slideshow=1`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { data: PublicLevels | null };
      if (json.data) levelsCache.set(k, json.data);
      return json.data ?? null;
    } catch {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}

export function cachedLevels(scope: Scope, symbol: string): PublicLevels | null {
  return levelsCache.get(`lv:${key(scope, symbol)}`) ?? null;
}

/** AI-grounded recent news. Slowest call (10–20s cold), so cache aggressively. */
export async function fetchNews(
  scope: Scope,
  symbol: string,
): Promise<LevelsNews | null> {
  const k = `nw:${key(scope, symbol)}`;
  const cached = newsCache.get(k);
  if (cached) return cached;

  const existing = inflight.get(k) as Promise<LevelsNews | null> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(
        `/api/freedombot/levels/news?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}&window=${LEVELS_NEWS_WINDOW_DAYS}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok: boolean; news?: LevelsNews };
      if (json.ok && json.news) {
        newsCache.set(k, json.news);
        return json.news;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}

export function cachedNews(scope: Scope, symbol: string): LevelsNews | null {
  return newsCache.get(`nw:${key(scope, symbol)}`) ?? null;
}

/** Warm the candle server-cache (Dhan) once per symbol so the chart paints fast. */
function warmCandles(scope: Scope, symbol: string): void {
  const k = key(scope, symbol);
  if (candlesWarmed.has(k)) return;
  candlesWarmed.add(k);
  void fetch(
    `/api/freedombot/levels/candles?symbol=${encodeURIComponent(symbol)}&scope=${encodeURIComponent(scope)}&interval=15`,
    { cache: "no-store" },
  ).catch(() => {
    candlesWarmed.delete(k); // allow a later retry
  });
}

/** Background-warm everything for an upcoming symbol before we fade to it. */
export function prefetchSymbol(scope: Scope, symbol: string): void {
  void fetchLevels(scope, symbol);
  void fetchNews(scope, symbol);
  warmCandles(scope, symbol);
}
