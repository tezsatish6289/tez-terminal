/**
 * Intraday candles for NSE stocks via Dhan Data API (DhanHQ v2).
 *
 * Powers the native candlestick chart on freedombot.ai/levels → NSE Stocks.
 * TradingView's free embed blocks licensed NSE equity data, so we draw our own
 * candles from Dhan (which we already use for live stock trading + LTP).
 *
 * Server-only. Uses the house Dhan token (auto-renewed) and an in-memory cache
 * shared across all requests, so visitor count never multiplies Dhan calls.
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { ensureValidToken } from "@/lib/dhan-token";

const DHAN_BASE_URL = "https://api.dhan.co/v2";
const DHAN_TIMEOUT_MS = 8000;

/** One bar for lightweight-charts (time in epoch seconds, UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandleResult {
  ok: boolean;
  candles: Candle[];
  error?: string;
  stale?: boolean;
}

/** Dhan intraday supports 1, 5, 15, 25, 60 minute candles. */
const ALLOWED_INTERVALS = new Set(["1", "5", "15", "25", "60"]);

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

// ── Security ID resolution (Firestore config/dhan_instruments) ──────

let securityIdMap: Map<string, number> | null = null;
let securityIdLoadedAt = 0;
const SECURITY_ID_TTL_MS = 60 * 60 * 1000; // 1h — instrument list is stable

async function getSecurityId(symbol: string): Promise<number | null> {
  const upper = symbol.toUpperCase();
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

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DhanIntradayResponse {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
}

async function fetchDhanIntraday(
  securityId: number,
  interval: string,
): Promise<Candle[]> {
  const creds = await ensureValidToken();
  if (!creds) throw new Error("Dhan token unavailable");

  // ~7 calendar days back gives a few sessions of intraday context.
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DHAN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${DHAN_BASE_URL}/charts/intraday`, {
      method: "POST",
      headers: {
        "access-token": creds.apiKey,
        "client-id": creds.apiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        securityId: String(securityId),
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval,
        oi: false,
        fromDate: fmtDate(from),
        toDate: fmtDate(to),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dhan intraday ${res.status}: ${text.slice(0, 200)}`);
  }

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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get intraday candles for an NSE stock, cache-first.
 * Returns last-good (stale) candles if a refresh fails.
 */
export async function getStockCandles(
  symbol: string,
  interval = "5",
): Promise<CandleResult> {
  const tf = ALLOWED_INTERVALS.has(interval) ? interval : "5";
  const key = `${symbol.toUpperCase()}:${tf}`;

  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, candles: cached.candles };
  }

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const securityId = await getSecurityId(symbol);
      if (securityId == null) {
        throw new Error(`No Dhan securityId for ${symbol}`);
      }
      const candles = await fetchDhanIntraday(securityId, tf);
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
    // Serve last-good candles on transient failure.
    if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) {
      return { ok: true, candles: cached.candles, stale: true };
    }
    return { ok: false, candles: [], error: msg };
  }
}
