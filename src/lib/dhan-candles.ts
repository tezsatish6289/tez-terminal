/**
 * Intraday candles for NSE stocks and indices via Dhan Data API (DhanHQ v2).
 *
 * Powers the native candlestick chart on freedombot.ai/levels (stocks + indices).
 * TradingView's free embed blocks licensed NSE data, so we draw our own candles
 * from Dhan (which we already use for live trading + LTP).
 *
 * Server-only. Uses the house Dhan token (auto-renewed) and an in-memory cache
 * shared across all requests, so visitor count never multiplies Dhan calls.
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { ensureValidToken } from "@/lib/dhan-token";
import { dhanIndexSecurityId } from "@/lib/nse/dhan-index-ids";

const DHAN_BASE_URL = "https://api.dhan.co/v2";
const DHAN_TIMEOUT_MS = 12_000;
/** Calendar days of intraday history per Dhan request (API allows much more). */
export const INTRADAY_LOOKBACK_DAYS = 30;

/** One bar for lightweight-charts (time in epoch seconds, UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Coarse failure class so the API/UI can react without parsing vendor text. */
export type CandleErrorCode = "rate_limit" | "no_data" | "unavailable";

export interface CandleResult {
  ok: boolean;
  candles: Candle[];
  /** Raw message for server logs only — never forward to the client. */
  error?: string;
  code?: CandleErrorCode;
  stale?: boolean;
}

function classifyCandleError(e: unknown): CandleErrorCode {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (m.includes("429") || m.includes("rate") || m.includes("dh-904")) return "rate_limit";
  if (m.includes("securityid") || m.includes("no candles")) return "no_data";
  return "unavailable";
}

/** Dhan intraday supports 1, 5, 15, 25, 60 minute candles. */
const ALLOWED_INTERVALS = new Set(["1", "5", "15", "25", "60"]);

/** Calendar days of daily history for History mode (~120 trading days + weekends/holidays). */
export const DAILY_LOOKBACK_DAYS = 130;
/** Daily bars change once per session — cache far longer than intraday. */
const DAILY_CACHE_TTL_MS = 30 * 60 * 1000;

/** Refresh window — all viewers share one fetch per symbol+interval. */
const CACHE_TTL_MS = 60 * 1000;
/** Keep last-good candles this long to survive transient Dhan errors. */
const STALE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  candles: Candle[];
  fetchedAt: number;
}

const candleCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Candle[]>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Space out intraday calls so concurrent chart loads (slideshow advancing,
 * multiple viewers) don't breach Dhan's per-user rate limit. Process-global,
 * shared across every symbol/interval.
 */
const INTRADAY_MIN_GAP_MS = 350;
const INTRADAY_MAX_ATTEMPTS = 3;
let lastIntradayCallAt = 0;

async function throttleIntraday(): Promise<void> {
  const now = Date.now();
  const wait = lastIntradayCallAt + INTRADAY_MIN_GAP_MS - now;
  if (wait > 0) await sleep(wait);
  lastIntradayCallAt = Date.now();
}

// ── Security ID resolution (Firestore config/dhan_instruments) ──────

let securityIdMap: Map<string, number> | null = null;
let securityIdLoadedAt = 0;
const SECURITY_ID_TTL_MS = 60 * 60 * 1000; // 1h — instrument list is stable

/** Call after Firestore `config/dhan_instruments` is updated. */
export function invalidateDhanSecurityIdCache(): void {
  securityIdMap = null;
  securityIdLoadedAt = 0;
}

/** Strip cache prefixes (`EQ:`, `NSE:`) before Firestore instrument lookup. */
function normalizeEquitySymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.startsWith("EQ:")) return s.slice(3);
  if (s.startsWith("NSE:")) return s.slice(4);
  return s;
}

/** NSE equity underlying ID from `config/dhan_instruments` (shared with option chain). */
export async function resolveDhanEquitySecurityId(symbol: string): Promise<number | null> {
  const upper = normalizeEquitySymbol(symbol);
  if (!upper) return null;
  const fresh = securityIdMap && Date.now() - securityIdLoadedAt < SECURITY_ID_TTL_MS;
  if (!fresh) {
    try {
      const db = getAdminFirestore();
      const snap = await db.collection("config").doc("dhan_instruments").get();
      const map = new Map<string, number>();
      if (snap.exists) {
        const data = snap.data() as Record<string, unknown>;
        for (const [sym, val] of Object.entries(data)) {
          const id = typeof val === "number" ? val : Number(val);
          if (Number.isFinite(id) && id > 0) map.set(sym.toUpperCase(), id);
        }
      }
      securityIdMap = map;
      securityIdLoadedAt = Date.now();
    } catch (e) {
      console.error("[dhan-candles] failed to load instrument map:", e);
      if (!securityIdMap) return null;
    }
  }
  return securityIdMap?.get(upper) ?? null;
}

// ── Dhan intraday fetch ─────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Format the IST calendar date (YYYY-MM-DD) of a given instant. */
function fmtIstDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Dhan's `toDate` is **non-inclusive** (per DhanHQ v2 docs), so passing today's
 * date returns candles strictly *before* today — silently dropping the current
 * (and, right after midnight IST, the most recent) trading session and making
 * the chart's latest price look stale/wrong.
 *
 * Fix: anchor the range to the IST calendar and push `toDate` to tomorrow so the
 * latest session is always included. Dhan clamps future dates to the last
 * available bar, so an end date ahead of "now" is safe.
 */
function dhanDateRange(lookbackDays: number): { fromDate: string; toDate: string } {
  const now = Date.now();
  return {
    fromDate: fmtIstDate(new Date(now - lookbackDays * DAY_MS)),
    toDate: fmtIstDate(new Date(now + DAY_MS)),
  };
}

interface DhanIntradayResponse {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
}

type DhanCandleSegment = {
  exchangeSegment: "NSE_EQ" | "IDX_I";
  instrument: "EQUITY" | "INDEX";
};

async function fetchDhanIntraday(
  securityId: number,
  interval: string,
  segment: DhanCandleSegment,
): Promise<Candle[]> {
  const creds = await ensureValidToken();
  if (!creds) throw new Error("Dhan token unavailable");

  const { fromDate, toDate } = dhanDateRange(INTRADAY_LOOKBACK_DAYS);
  const body = JSON.stringify({
    securityId: String(securityId),
    exchangeSegment: segment.exchangeSegment,
    instrument: segment.instrument,
    interval,
    oi: false,
    fromDate,
    toDate,
  });

  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < INTRADAY_MAX_ATTEMPTS; attempt++) {
    await throttleIntraday();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DHAN_TIMEOUT_MS);
    try {
      res = await fetch(`${DHAN_BASE_URL}/charts/intraday`, {
        method: "POST",
        headers: {
          "access-token": creds.apiKey,
          "client-id": creds.apiSecret,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) break;

    // 429 (rate limit) and 5xx are transient — back off and retry.
    const transient = res.status === 429 || res.status >= 500;
    lastErr = `Dhan intraday ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (transient && attempt < INTRADAY_MAX_ATTEMPTS - 1) {
      await sleep(600 * (attempt + 1) + Math.round(Math.random() * 200));
      continue;
    }
    throw new Error(lastErr);
  }

  if (!res || !res.ok) throw new Error(lastErr || "Dhan intraday failed");

  const data = (await res.json()) as DhanIntradayResponse;
  const ts = data.timestamp ?? [];
  const open = data.open ?? [];
  const high = data.high ?? [];
  const low = data.low ?? [];
  const close = data.close ?? [];
  const volume = data.volume ?? [];

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = Number(ts[i]);
    const o = Number(open[i]);
    const h = Number(high[i]);
    const l = Number(low[i]);
    const c = Number(close[i]);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    candles.push({ time: t, open: o, high: h, low: l, close: c, volume: Number(volume[i]) || 0 });
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

// ── Dhan daily (historical) fetch ───────────────────────────────────

/** Parse Dhan's parallel-array OHLC response into sorted candles. */
function parseDhanOhlc(data: DhanIntradayResponse): Candle[] {
  const ts = data.timestamp ?? [];
  const open = data.open ?? [];
  const high = data.high ?? [];
  const low = data.low ?? [];
  const close = data.close ?? [];
  const volume = data.volume ?? [];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = Number(ts[i]);
    const o = Number(open[i]);
    const h = Number(high[i]);
    const l = Number(low[i]);
    const c = Number(close[i]);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    candles.push({ time: t, open: o, high: h, low: l, close: c, volume: Number(volume[i]) || 0 });
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

async function fetchDhanDaily(
  securityId: number,
  segment: DhanCandleSegment,
  days: number,
): Promise<Candle[]> {
  const creds = await ensureValidToken();
  if (!creds) throw new Error("Dhan token unavailable");

  const { fromDate, toDate } = dhanDateRange(days);
  const body = JSON.stringify({
    securityId: String(securityId),
    exchangeSegment: segment.exchangeSegment,
    instrument: segment.instrument,
    expiryCode: 0,
    oi: false,
    fromDate,
    toDate,
  });

  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < INTRADAY_MAX_ATTEMPTS; attempt++) {
    await throttleIntraday();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DHAN_TIMEOUT_MS);
    try {
      res = await fetch(`${DHAN_BASE_URL}/charts/historical`, {
        method: "POST",
        headers: {
          "access-token": creds.apiKey,
          "client-id": creds.apiSecret,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) break;
    const transient = res.status === 429 || res.status >= 500;
    lastErr = `Dhan historical ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (transient && attempt < INTRADAY_MAX_ATTEMPTS - 1) {
      await sleep(600 * (attempt + 1) + Math.round(Math.random() * 200));
      continue;
    }
    throw new Error(lastErr);
  }

  if (!res || !res.ok) throw new Error(lastErr || "Dhan historical failed");
  return parseDhanOhlc((await res.json()) as DhanIntradayResponse);
}

async function getDailyCandlesCached(
  cacheKey: string,
  resolveSecurityId: () => Promise<number | null>,
  segment: DhanCandleSegment,
  days = DAILY_LOOKBACK_DAYS,
): Promise<CandleResult> {
  const key = `${cacheKey}:D:${days}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < DAILY_CACHE_TTL_MS) {
    return { ok: true, candles: cached.candles };
  }

  // Reuse a longer cached series when a shorter window is requested.
  const dailyPrefix = `${cacheKey}:D:`;
  for (const [cacheEntryKey, entry] of candleCache.entries()) {
    if (!cacheEntryKey.startsWith(dailyPrefix)) continue;
    const cachedDays = Number(cacheEntryKey.slice(dailyPrefix.length));
    if (
      Number.isFinite(cachedDays) &&
      cachedDays >= days &&
      Date.now() - entry.fetchedAt < DAILY_CACHE_TTL_MS
    ) {
      return { ok: true, candles: entry.candles };
    }
  }

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const securityId = await resolveSecurityId();
      if (securityId == null) throw new Error(`No Dhan securityId for ${cacheKey}`);
      const candles = await fetchDhanDaily(securityId, segment, days);
      candleCache.set(key, { candles, fetchedAt: Date.now() });
      return candles;
    })();
    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
  }

  try {
    return { ok: true, candles: await promise };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cached) return { ok: true, candles: cached.candles, stale: true };
    return { ok: false, candles: [], error: msg, code: classifyCandleError(e) };
  }
}

// ── Public API ──────────────────────────────────────────────────────

async function getCandlesCached(
  cacheKey: string,
  resolveSecurityId: () => Promise<number | null>,
  segment: DhanCandleSegment,
  interval = "5",
): Promise<CandleResult> {
  const tf = ALLOWED_INTERVALS.has(interval) ? interval : "5";
  const key = `${cacheKey}:${tf}`;

  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, candles: cached.candles };
  }

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const securityId = await resolveSecurityId();
      if (securityId == null) {
        throw new Error(`No Dhan securityId for ${cacheKey}`);
      }
      const candles = await fetchDhanIntraday(securityId, tf, segment);
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
    // Survive transient errors (rate limit, timeout) with last-good candles.
    if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) {
      return { ok: true, candles: cached.candles, stale: true };
    }
    return { ok: false, candles: [], error: msg, code: classifyCandleError(e) };
  }
}

/** NSE F&O stock — NSE_EQ / EQUITY. */
export async function getStockCandles(symbol: string, interval = "5"): Promise<CandleResult> {
  const upper = symbol.toUpperCase();
  return getCandlesCached(
    `EQ:${upper}`,
    () => resolveDhanEquitySecurityId(upper),
    { exchangeSegment: "NSE_EQ", instrument: "EQUITY" },
    interval,
  );
}

/** NSE index (NIFTY, BANKNIFTY, …) — IDX_I / INDEX. */
export async function getIndexCandles(symbol: string, interval = "5"): Promise<CandleResult> {
  const upper = symbol.toUpperCase();
  return getCandlesCached(
    `IDX:${upper}`,
    async () => dhanIndexSecurityId(upper),
    { exchangeSegment: "IDX_I", instrument: "INDEX" },
    interval,
  );
}

/** Daily OHLC for an F&O stock — feeds the levels "History mode" chart. */
export async function getStockDailyCandles(symbol: string, days = DAILY_LOOKBACK_DAYS): Promise<CandleResult> {
  const upper = symbol.toUpperCase();
  return getDailyCandlesCached(
    `EQ:${upper}`,
    () => resolveDhanEquitySecurityId(upper),
    { exchangeSegment: "NSE_EQ", instrument: "EQUITY" },
    days,
  );
}

/** Daily OHLC for an NSE index — feeds the levels "History mode" chart. */
export async function getIndexDailyCandles(symbol: string, days = DAILY_LOOKBACK_DAYS): Promise<CandleResult> {
  const upper = symbol.toUpperCase();
  return getDailyCandlesCached(
    `IDX:${upper}`,
    async () => dhanIndexSecurityId(upper),
    { exchangeSegment: "IDX_I", instrument: "INDEX" },
    days,
  );
}
