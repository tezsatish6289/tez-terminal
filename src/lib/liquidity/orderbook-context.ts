/**
 * Order Book Context — Bybit public REST, no auth required
 *
 * Computes bid/ask imbalance across three price bands and detects
 * liquidity walls (single orders ≥ 3× mean order size).
 *
 * In-memory cache per symbol with a 60s TTL.
 *
 * Extending to Binance: implement fetchOrderBookContext using
 * /fapi/v1/depth with the same OBBand/OBWall interface.
 */

import type { OrderBookContext, OBBand, OBWall } from "./types";

const BYBIT_BASE = "https://api.bybit.com";
const CACHE_TTL_MS = 5 * 60_000; // matches WS server OB_INTERVAL_MS
const WALL_MULTIPLIER = 3; // a wall = single order ≥ 3× avg order size

// ── In-memory cache ───────────────────────────────────────────

const cache = new Map<string, { data: OrderBookContext; fetchedAt: number }>();

// ── Helpers ───────────────────────────────────────────────────

function computeBand(
  bids: [number, number][],
  asks: [number, number][],
  center: number,
  bandPct: number,
): OBBand {
  const lower = center * (1 - bandPct / 100);
  const upper = center * (1 + bandPct / 100);

  const bidVol = bids
    .filter(([p]) => p >= lower && p <= center)
    .reduce((s, [, v]) => s + v, 0);

  const askVol = asks
    .filter(([p]) => p >= center && p <= upper)
    .reduce((s, [, v]) => s + v, 0);

  const total = bidVol + askVol;
  return {
    bidVol,
    askVol,
    imbalance: total > 0 ? (bidVol - askVol) / total : 0,
  };
}

function detectWalls(
  bids: [number, number][],
  asks: [number, number][],
  center: number,
  bandPct: number,
): OBWall[] {
  const lower = center * (1 - bandPct / 100);
  const upper = center * (1 + bandPct / 100);

  const relevantBids = bids.filter(([p]) => p >= lower && p <= center);
  const relevantAsks = asks.filter(([p]) => p >= center && p <= upper);

  const avgBidSize =
    relevantBids.length > 0
      ? relevantBids.reduce((s, [, v]) => s + v, 0) / relevantBids.length
      : 0;
  const avgAskSize =
    relevantAsks.length > 0
      ? relevantAsks.reduce((s, [, v]) => s + v, 0) / relevantAsks.length
      : 0;

  const walls: OBWall[] = [];

  for (const [price, size] of relevantBids) {
    if (avgBidSize > 0 && size >= avgBidSize * WALL_MULTIPLIER) {
      walls.push({
        price,
        side: "bid",
        size,
        distancePct: Math.abs((price - center) / center) * 100,
      });
    }
  }

  for (const [price, size] of relevantAsks) {
    if (avgAskSize > 0 && size >= avgAskSize * WALL_MULTIPLIER) {
      walls.push({
        price,
        side: "ask",
        size,
        distancePct: Math.abs((price - center) / center) * 100,
      });
    }
  }

  return walls.sort((a, b) => a.distancePct - b.distancePct);
}

// ── Fetcher ───────────────────────────────────────────────────

export async function fetchOrderBookContext(
  symbol: string,
  currentPrice: number,
): Promise<OrderBookContext | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  // Bybit REST API uses bare symbols (e.g. "BTCUSDT"), not the ".P"-suffixed
  // format used by signals and WS subscriptions (e.g. "BTCUSDT.P").
  const apiSymbol = symbol.replace(/\.P$/, "");

  // Abort if Bybit doesn't respond within 5s — prevents indefinite hangs that
  // would stall the entire OB batch loop in the WS server.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 5_000);

  try {
    // limit=50 gives ±50 levels each side — sufficient for ±1% at most prices
    const res = await fetch(
      `${BYBIT_BASE}/v5/market/orderbook?category=linear&symbol=${apiSymbol}&limit=50`,
      { signal: controller.signal, headers: { Connection: "close" } },
    );
    const json = await res.json();

    if (json.retCode !== 0 || !json.result) return null;

    // Parse raw arrays: Bybit returns [["price", "size"], ...]
    const bids: [number, number][] = (json.result.b as [string, string][]).map(
      ([p, v]) => [parseFloat(p), parseFloat(v)],
    );
    const asks: [number, number][] = (json.result.a as [string, string][]).map(
      ([p, v]) => [parseFloat(p), parseFloat(v)],
    );

    const result: OrderBookContext = {
      currentPrice,
      bands: {
        tight: computeBand(bids, asks, currentPrice, 0.1),
        structural: computeBand(bids, asks, currentPrice, 0.3),
        extended: computeBand(bids, asks, currentPrice, 1.0),
      },
      // Walls detected within ±1% band
      walls: detectWalls(bids, asks, currentPrice, 1.0),
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

export function evictOBCache(symbol: string): void {
  cache.delete(symbol);
}
