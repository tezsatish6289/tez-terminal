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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AI-grounded recent news. Slowest call (15–25s cold) and it can fail outright
 * (rate-limit / timeout / transient 5xx). Retry with backoff so a transient
 * failure recovers and then caches, instead of leaving a symbol stuck.
 */
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
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
      } catch {
        /* retry below */
      }
      if (attempt < MAX_ATTEMPTS - 1) await sleep(5000 + attempt * 4000);
    }
    return null;
  })().finally(() => {
    inflight.delete(k);
  });
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

/** Warm the full rotation queue as soon as levels load — news cold-starts
 *  take 15–25s so waiting until the 14s map interstitial is often too late. */
export function prefetchAllSymbols(items: { scope: Scope; symbol: string }[]): void {
  for (const { scope, symbol } of items) {
    prefetchSymbol(scope, symbol);
  }
}
