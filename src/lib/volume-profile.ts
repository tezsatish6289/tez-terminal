/**
 * Volume-profile-based liquidation zone suggester.
 *
 * Fetches hourly BTC/USDT candles from Bybit (fallback: Binance),
 * spreads each candle's volume across the price buckets it touched,
 * then finds the highest-volume node above and below the current price.
 *
 * High-volume nodes approximate Coinglass liquidation bands because:
 *   – lots of trading at a price level → many leveraged positions opened there
 *   – lots of positions → large liquidation exposure at that price
 */

const BUCKET_SIZE    = 500;  // $500 per bucket — wide enough to smooth noise
const LOOKBACK_HOURS = 168;  // 7 days

export interface VolumeNode {
  low:    number; // bucket lower bound
  high:   number; // bucket upper bound
  volume: number; // total BTC volume in bucket
}

export interface SuggestedZones {
  /** Dominant volume node BELOW current price → bull support / long liquidation cluster */
  bullNode:    VolumeNode | null;
  /** Dominant volume node ABOVE current price → bear resistance / short liquidation cluster */
  bearNode:    VolumeNode | null;
  btcPrice:    number;
  source:      "bybit" | "binance";
  computedAt:  string;
}

// ── Kline fetchers ─────────────────────────────────────────────

interface RawKline { high: number; low: number; volume: number }

async function fetchBybit(): Promise<RawKline[]> {
  const url =
    `https://api.bybit.com/v5/market/kline` +
    `?category=linear&symbol=BTCUSDT&interval=60&limit=${LOOKBACK_HOURS}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const json = await res.json() as { result?: { list?: string[][] } };
  const list = json?.result?.list ?? [];
  // Bybit format per row: [startTime, open, high, low, close, volume, turnover]
  return list.map((k) => ({
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    volume: parseFloat(k[5]),
  }));
}

async function fetchBinance(): Promise<RawKline[]> {
  const url =
    `https://fapi.binance.com/fapi/v1/klines` +
    `?symbol=BTCUSDT&interval=1h&limit=${LOOKBACK_HOURS}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const rows = await res.json() as unknown[][];
  // Binance format: [openTime, open, high, low, close, volume, ...]
  return rows.map((k) => ({
    high:   parseFloat(String(k[2])),
    low:    parseFloat(String(k[3])),
    volume: parseFloat(String(k[5])),
  }));
}

// ── Core algorithm ─────────────────────────────────────────────

function buildProfile(klines: RawKline[]): Map<number, number> {
  // bucketIndex → total volume
  const profile = new Map<number, number>();

  for (const { high, low, volume } of klines) {
    if (high <= low || volume <= 0) continue;

    const startIdx = Math.floor(low  / BUCKET_SIZE);
    const endIdx   = Math.floor(high / BUCKET_SIZE);
    const count    = endIdx - startIdx + 1;
    const volEach  = volume / count;

    for (let i = startIdx; i <= endIdx; i++) {
      profile.set(i, (profile.get(i) ?? 0) + volEach);
    }
  }
  return profile;
}

function topNode(
  profile:  Map<number, number>,
  fromIdx:  number,
  toIdx:    number, // inclusive
): VolumeNode | null {
  let bestIdx = -1;
  let bestVol = 0;

  for (const [idx, vol] of profile) {
    if (idx >= fromIdx && idx <= toIdx && vol > bestVol) {
      bestVol = vol;
      bestIdx = idx;
    }
  }
  if (bestIdx < 0) return null;
  return {
    low:    bestIdx * BUCKET_SIZE,
    high:   (bestIdx + 1) * BUCKET_SIZE,
    volume: Math.round(bestVol),
  };
}

// ── Public API ─────────────────────────────────────────────────

export async function computeSuggestedZones(
  currentBtcPrice: number,
): Promise<SuggestedZones> {
  let klines: RawKline[] = [];
  let source: "bybit" | "binance" = "bybit";

  try {
    klines = await fetchBybit();
  } catch {
    klines = await fetchBinance();
    source = "binance";
  }

  if (klines.length < 10) throw new Error("Insufficient candle data");

  const profile   = buildProfile(klines);
  const priceIdx  = Math.floor(currentBtcPrice / BUCKET_SIZE);

  // Skip the 3 buckets ($1,500) immediately around current price — those
  // are always the highest-volume because that's where price has been
  // sitting. We want meaningful liquidation clusters away from spot.
  const MIN_GAP      = 3;   // buckets = $1,500 minimum distance from spot
  const SEARCH_RADIUS = 20; // 20 buckets = $10,000 search window each side

  const bullNode = topNode(profile, priceIdx - SEARCH_RADIUS, priceIdx - MIN_GAP);
  const bearNode = topNode(profile, priceIdx + MIN_GAP, priceIdx + SEARCH_RADIUS);

  return {
    bullNode,
    bearNode,
    btcPrice:   currentBtcPrice,
    source,
    computedAt: new Date().toISOString(),
  };
}
