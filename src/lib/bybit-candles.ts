/**
 * Intraday candles for crypto perps via Bybit public market API (v5).
 *
 * Powers the native candlestick chart on tezterminal.com/simulation.
 * Mirrors the dhan-candles architecture: server-only, in-memory cache,
 * inflight dedupe, stale fallback, throttled upstream calls.
 */

import "server-only";
import type { Candle, CandleErrorCode, CandleResult } from "@/lib/dhan-candles";

export type { Candle, CandleErrorCode, CandleResult };

/** Calendar days of 15m history loaded per symbol (crypto is 24/7). */
export const INTRADAY_LOOKBACK_DAYS = 7;

const BYBIT_BASE = "https://api.bybit.com";
const BYBIT_TIMEOUT_MS = 12_000;
const PAGE_LIMIT = 1000;

/** Cockpit bots — linear USDT perps on Bybit. */
const ALLOWED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]);

/** Bybit kline intervals (minutes or D/W/M). */
const ALLOWED_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M"]);

/** Refresh window — all viewers share one fetch per symbol+interval. */
const CACHE_TTL_MS = 60 * 1000;
/** Keep last-good candles this long to survive transient Bybit errors. */
const STALE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  candles: Candle[];
  fetchedAt: number;
}

const candleCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Candle[]>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KLINE_MIN_GAP_MS = 200;
const KLINE_MAX_ATTEMPTS = 3;
let lastKlineCallAt = 0;

async function throttleKline(): Promise<void> {
  const now = Date.now();
  const wait = lastKlineCallAt + KLINE_MIN_GAP_MS - now;
  if (wait > 0) await sleep(wait);
  lastKlineCallAt = Date.now();
}

function classifyCandleError(e: unknown): CandleErrorCode {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (m.includes("429") || m.includes("rate")) return "rate_limit";
  if (m.includes("symbol") || m.includes("no candles") || m.includes("not supported")) return "no_data";
  return "unavailable";
}

export function normalizeBybitLinearSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  return ALLOWED_SYMBOLS.has(s) ? s : null;
}

function parseBybitRows(rows: string[][]): Candle[] {
  const out: Candle[] = [];
  for (const k of rows) {
    const startMs = Number(k[0]);
    const open = parseFloat(k[1]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);
    if (![startMs, open, high, low, close].every(Number.isFinite)) continue;
    out.push({
      time: Math.floor(startMs / 1000),
      open,
      high,
      low,
      close,
      volume: parseFloat(k[5]) || 0,
    });
  }
  return out;
}

async function fetchBybitKlinePage(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const url =
    `${BYBIT_BASE}/v5/market/kline` +
    `?category=linear&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&start=${startMs}&end=${endMs}&limit=${PAGE_LIMIT}`;

  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < KLINE_MAX_ATTEMPTS; attempt++) {
    await throttleKline();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BYBIT_TIMEOUT_MS);
    try {
      res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) break;

    const transient = res.status === 429 || res.status >= 500;
    lastErr = `Bybit kline ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (transient && attempt < KLINE_MAX_ATTEMPTS - 1) {
      await sleep(400 * (attempt + 1) + Math.round(Math.random() * 150));
      continue;
    }
    throw new Error(lastErr);
  }

  if (!res || !res.ok) throw new Error(lastErr || "Bybit kline failed");

  const json = (await res.json()) as { result?: { list?: string[][] } };
  return parseBybitRows(json?.result?.list ?? []);
}

/** Paginate backward until the lookback window is covered (7d ≈ 672 × 15m bars). */
async function fetchBybitIntraday(symbol: string, interval: string): Promise<Candle[]> {
  const endMs = Date.now();
  const startMs = endMs - INTRADAY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const byTime = new Map<number, Candle>();
  let pageEnd = endMs;

  while (pageEnd > startMs) {
    const batch = await fetchBybitKlinePage(symbol, interval, startMs, pageEnd);
    if (batch.length === 0) break;

    for (const c of batch) {
      byTime.set(c.time, c);
    }

    const oldestMs = Math.min(...batch.map((c) => c.time)) * 1000;
    if (batch.length < PAGE_LIMIT || oldestMs <= startMs) break;
    pageEnd = oldestMs - 1;
  }

  const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  if (candles.length === 0) throw new Error(`No candles for ${symbol}`);
  return candles;
}

/** Linear USDT perp — BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT. */
export async function getLinearCandles(symbol: string, interval = "15"): Promise<CandleResult> {
  const upper = normalizeBybitLinearSymbol(symbol);
  if (!upper) {
    return { ok: false, candles: [], error: `Unsupported symbol ${symbol}`, code: "no_data" };
  }

  const tf = ALLOWED_INTERVALS.has(interval) ? interval : "15";
  const key = `${upper}:${tf}`;

  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, candles: cached.candles };
  }

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const candles = await fetchBybitIntraday(upper, tf);
      candleCache.set(key, { candles, fetchedAt: Date.now() });
      return candles;
    })();
    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
  }

  try {
    const candles = await promise;
    return { ok: true, candles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) {
      return { ok: true, candles: cached.candles, stale: true };
    }
    return { ok: false, candles: [], error: msg, code: classifyCandleError(e) };
  }
}
