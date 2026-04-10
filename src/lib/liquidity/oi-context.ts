/**
 * OI Context — Bybit public REST, no auth required
 *
 * Fetches open interest history + mark price (via klines) to build a
 * price-OI correlation, then pulls funding rate from the tickers endpoint.
 *
 * In-memory cache per symbol avoids redundant API calls between the
 * per-symbol 30s refresh ticks in the WS server.
 *
 * Adding Binance support later: implement the same contract using
 * /futures/data/openInterestHist and /fapi/v1/klines.
 */

import type { OIContext, OISnapshot } from "./types";

const BYBIT_BASE = "https://api.bybit.com";
const CACHE_TTL_MS = 30_000;

// ── In-memory cache ───────────────────────────────────────────

const cache = new Map<string, { data: OIContext; fetchedAt: number }>();

// ── Pearson correlation ───────────────────────────────────────

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return 0;
  return num / Math.sqrt(denomX * denomY);
}

// ── Fetcher ───────────────────────────────────────────────────

export async function fetchOIContext(
  symbol: string,
): Promise<OIContext | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  // Bybit REST API uses bare symbols (e.g. "BTCUSDT"), not the ".P"-suffixed
  // format used by signals and WS subscriptions (e.g. "BTCUSDT.P").
  const apiSymbol = symbol.replace(/\.P$/, "");

  // Abort if Bybit doesn't respond within 6s — prevents indefinite hangs that
  // would stall the entire OI batch loop in the WS server.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 6_000);

  try {
    // Fetch OI history + klines (for mark prices) + ticker (for funding rate)
    // in parallel to minimise latency.
    const headers = { Connection: "close" };
    const [oiRes, klineRes, tickerRes] = await Promise.all([
      fetch(
        `${BYBIT_BASE}/v5/market/open-interest?category=linear&symbol=${apiSymbol}&intervalTime=5min&limit=7`,
        { signal: controller.signal, headers },
      ),
      fetch(
        `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${apiSymbol}&interval=5&limit=8`,
        { signal: controller.signal, headers },
      ),
      fetch(
        `${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${apiSymbol}`,
        { signal: controller.signal, headers },
      ),
    ]);

    const [oiJson, klineJson, tickerJson] = await Promise.all([
      oiRes.json(),
      klineRes.json(),
      tickerRes.json(),
    ]);

    if (
      oiJson.retCode !== 0 ||
      !Array.isArray(oiJson.result?.list) ||
      oiJson.result.list.length < 2
    )
      return null;

    if (tickerJson.retCode !== 0 || !tickerJson.result?.list?.[0]) return null;

    const ticker = tickerJson.result.list[0];
    const fundingRate = parseFloat(ticker.fundingRate ?? "0");

    // Bybit OI list: newest first → reverse to chronological
    const oiList: Array<{ openInterest: string; timestamp: string }> =
      oiJson.result.list;
    const oiChron = [...oiList].reverse();

    // Bybit kline list: [startTime, open, high, low, close, volume, turnover]
    // newest first → reverse to chronological
    const klineList: string[][] = Array.isArray(klineJson.result?.list)
      ? [...klineJson.result.list].reverse()
      : [];

    // Build snapshots aligned by index (both series cover same 5-min intervals)
    const snapshots: OISnapshot[] = oiChron.map((item, idx) => {
      const kline = klineList[idx];
      const closePrice = kline ? parseFloat(kline[4]) : 0;
      return {
        ts: parseInt(item.timestamp, 10),
        oi: parseFloat(item.openInterest),
        price: closePrice,
      };
    });

    // OI % changes
    const newest = snapshots[snapshots.length - 1]?.oi ?? 0;
    const prev1 = snapshots[snapshots.length - 2]?.oi ?? newest;
    const oldest = snapshots[0]?.oi ?? newest;
    const oiChange5m = prev1 !== 0 ? ((newest - prev1) / prev1) * 100 : 0;
    const oiChange30m = oldest !== 0 ? ((newest - oldest) / oldest) * 100 : 0;

    // Price-OI correlation: Pearson(ΔOI, Δprice) across intervals
    const deltaOI = snapshots
      .slice(1)
      .map((s, i) => s.oi - snapshots[i].oi);
    const deltaPrice = snapshots
      .slice(1)
      .map((s, i) => s.price - snapshots[i].price);
    const priceOICorrelation =
      deltaPrice.every((d) => d === 0) ? 0 : pearson(deltaOI, deltaPrice);

    const result: OIContext = {
      snapshots,
      priceOICorrelation,
      oiChange5m,
      oiChange30m,
      fundingRate,
      updatedAt: new Date().toISOString(),
    };

    cache.set(symbol, { data: result, fetchedAt: Date.now() });
    clearTimeout(abortTimer);
    return result;
  } catch {
    clearTimeout(abortTimer);
    return null;
  }
}

// ── Cache invalidation (called by WS server on symbol removal) ─

export function evictOICache(symbol: string): void {
  cache.delete(symbol);
}
