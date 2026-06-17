import type { Candle, StockSlide, VideoData } from "../schema";

/** Deterministic pseudo-random walk so the prototype renders identically every run. */
function makeCandles(seed: number, spot: number, bars = 120): Candle[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const out: Candle[] = [];
  let price = spot * 0.93;
  const drift = (spot - price) / bars;
  const start = 1_730_000_000;
  for (let i = 0; i < bars; i++) {
    const vol = spot * 0.006;
    const open = price;
    const move = drift + (rand() - 0.5) * vol;
    const close = Math.max(1, open + move);
    const high = Math.max(open, close) + rand() * vol * 0.6;
    const low = Math.min(open, close) - rand() * vol * 0.6;
    out.push({
      time: start + i * 900,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
    });
    price = close;
  }
  return out;
}

function slide(
  partial: Omit<StockSlide, "candles" | "bullLow" | "bullHigh" | "bearLow" | "bearHigh"> & {
    bandPct?: number;
    seed: number;
  },
): StockSlide {
  // zoneState comes through partial; bands derived below.
  const { bandPct = 0.0075, seed, ...rest } = partial;
  const hw = rest.spot * bandPct;
  const bull = rest.putClusterStrike;
  const bear = rest.callClusterStrike;
  return {
    ...rest,
    candles: makeCandles(seed, rest.spot),
    bullLow: bull != null ? bull - hw : null,
    bullHigh: bull != null ? bull + hw : null,
    bearLow: bear != null ? bear - hw : null,
    bearHigh: bear != null ? bear + hw : null,
  };
}

export const samplePut: VideoData = {
  variant: "put",
  dateLabel: "17 Jun 2026",
  generatedAtLabel: "17 June 2026 at 04:00 PM",
  stocks: [
    slide({ symbol: "RELIANCE", label: "RELIANCE", zoneState: "IN", spot: 2418, putClusterSize: 4_120_000, putClusterStrike: 2400, callClusterSize: 2_300_000, callClusterStrike: 2500, maxPain: 2420, atmIV: 18.4, contextTag: "Near max-pain", seed: 11 }),
    slide({ symbol: "TATASTEEL", label: "TATASTEEL", zoneState: "IN", spot: 162.5, putClusterSize: 3_650_000, putClusterStrike: 160, callClusterSize: 1_900_000, callClusterStrike: 170, maxPain: 161, atmIV: 26.1, contextTag: "Calm IV", seed: 23 }),
    slide({ symbol: "HDFCBANK", label: "HDFCBANK", zoneState: "IN", spot: 1689, putClusterSize: 2_980_000, putClusterStrike: 1680, callClusterSize: 1_500_000, callClusterStrike: 1720, maxPain: 1685, atmIV: 15.2, contextTag: null, seed: 37 }),
    slide({ symbol: "SBIN", label: "SBIN", zoneState: "NEAR", spot: 842, putClusterSize: 2_540_000, putClusterStrike: 840, callClusterSize: 1_200_000, callClusterStrike: 860, maxPain: 845, atmIV: 21.7, contextTag: "Calm IV", seed: 49 }),
    slide({ symbol: "INFY", label: "INFY", zoneState: "NEAR", spot: 1576, putClusterSize: 2_210_000, putClusterStrike: 1560, callClusterSize: 1_100_000, callClusterStrike: 1600, maxPain: 1570, atmIV: 19.9, contextTag: "Earnings in 2d", seed: 61 }),
  ],
};

export const sampleCall: VideoData = {
  variant: "call",
  dateLabel: "17 Jun 2026",
  generatedAtLabel: "17 June 2026 at 04:00 PM",
  stocks: [
    slide({ symbol: "ICICIBANK", label: "ICICIBANK", zoneState: "IN", spot: 1184, putClusterSize: 1_400_000, putClusterStrike: 1160, callClusterSize: 3_900_000, callClusterStrike: 1200, maxPain: 1182, atmIV: 16.8, contextTag: "Near max-pain", seed: 71 }),
    slide({ symbol: "AXISBANK", label: "AXISBANK", zoneState: "IN", spot: 1108, putClusterSize: 1_200_000, putClusterStrike: 1080, callClusterSize: 3_400_000, callClusterStrike: 1120, maxPain: 1105, atmIV: 20.3, contextTag: "Calm IV", seed: 83 }),
    slide({ symbol: "BAJFINANCE", label: "BAJFINANCE", zoneState: "IN", spot: 7240, putClusterSize: 980_000, putClusterStrike: 7100, callClusterSize: 2_700_000, callClusterStrike: 7300, maxPain: 7250, atmIV: 24.5, contextTag: "Elevated IV", seed: 97 }),
    slide({ symbol: "MARUTI", label: "MARUTI", zoneState: "NEAR", spot: 12180, putClusterSize: 760_000, putClusterStrike: 12000, callClusterSize: 2_350_000, callClusterStrike: 12200, maxPain: 12150, atmIV: 17.1, contextTag: null, seed: 103 }),
    slide({ symbol: "LT", label: "LT", zoneState: "NEAR", spot: 3622, putClusterSize: 690_000, putClusterStrike: 3550, callClusterSize: 2_010_000, callClusterStrike: 3650, maxPain: 3620, atmIV: 18.6, contextTag: "Calm IV", seed: 117 }),
  ],
};
