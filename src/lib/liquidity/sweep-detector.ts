/**
 * Sweep Detector — pure function, no I/O
 *
 * Detects liquidation spikes using rolling mean + standard deviation
 * across six 5-second buckets within a 30-second window.
 *
 * A spike is defined as: current 5s volume ≥ minSigma × σ above
 * the 25s baseline mean AND ≥ minUSD in absolute notional.
 *
 * Returns a SweepResult. The WS server merges this with its
 * in-memory persistence state before writing to Firestore.
 */

import type { LiqEvent, SweepResult, SweepSide } from "./types";

// ── Statistics helpers ────────────────────────────────────────

function bucketStats(values: number[]): { mean: number; sigma: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sigma: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, sigma: Math.sqrt(variance) };
}

// ── Core detection ────────────────────────────────────────────

export function detectSweep(
  events: LiqEvent[],
  minSigma: number = 2.5,
  minUSD: number = 50_000,
  nowMs: number = Date.now(),
): SweepResult {
  const windowStart = nowMs - 30_000;

  // Only keep events within the 30s window
  const recent = events.filter(
    (e) => e.timestamp >= windowStart && e.timestamp <= nowMs,
  );

  // Divide 30s into 6 × 5s slots.
  // Slot 0 = current 5s window (the spike candidate).
  // Slots 1–5 = baseline.
  const buckets: Array<{ sell: number; buy: number }> = Array.from(
    { length: 6 },
    () => ({ sell: 0, buy: 0 }),
  );

  for (const e of recent) {
    const slotIdx = Math.floor((nowMs - e.timestamp) / 5_000);
    if (slotIdx < 0 || slotIdx > 5) continue;
    if (e.side === "Sell") buckets[slotIdx].sell += e.size;
    else buckets[slotIdx].buy += e.size;
  }

  // Baseline = slots 1–5 (exclude the current window from mean/σ)
  const baseline = buckets.slice(1);
  const sellStats = bucketStats(baseline.map((b) => b.sell));
  const buyStats = bucketStats(baseline.map((b) => b.buy));

  const sellVol5s = buckets[0].sell;
  const buyVol5s = buckets[0].buy;

  // σ above baseline mean (clamped at 0 for below-mean values)
  const sellSigmaAbove =
    sellStats.sigma > 0 ? (sellVol5s - sellStats.mean) / sellStats.sigma : 0;
  const buySigmaAbove =
    buyStats.sigma > 0 ? (buyVol5s - buyStats.mean) / buyStats.sigma : 0;

  const sellSpike = sellSigmaAbove >= minSigma && sellVol5s >= minUSD;
  const buySpike = buySigmaAbove >= minSigma && buyVol5s >= minUSD;

  const noSpike: SweepResult = {
    detected: false,
    side: null,
    strength: Math.max(sellSigmaAbove, buySigmaAbove, 0),
    weightedSweepPrice: null,
    sellVol5s,
    buyVol5s,
    sellMean: sellStats.mean,
    sellSigma: sellStats.sigma,
    buyMean: buyStats.mean,
    buySigma: buyStats.sigma,
  };

  if (!sellSpike && !buySpike) return noSpike;

  // When both sides spike simultaneously, take the stronger one
  const side: SweepSide =
    sellSpike && (!buySpike || sellSigmaAbove >= buySigmaAbove)
      ? "SELL_LIQ"  // long positions liquidated → bullish context for BUY signals
      : "BUY_LIQ";  // short positions liquidated → bearish context for SELL signals

  // Volume-weighted average price of the dominant side's events in the 5s window
  const w5start = nowMs - 5_000;
  const sideEvents = recent.filter(
    (e) =>
      e.timestamp >= w5start &&
      (side === "SELL_LIQ" ? e.side === "Sell" : e.side === "Buy"),
  );
  const totalVol = sideEvents.reduce((s, e) => s + e.size, 0);
  const weightedSweepPrice =
    totalVol > 0
      ? sideEvents.reduce((s, e) => s + e.price * e.size, 0) / totalVol
      : null;

  return {
    detected: true,
    side,
    strength: side === "SELL_LIQ" ? sellSigmaAbove : buySigmaAbove,
    weightedSweepPrice,
    sellVol5s,
    buyVol5s,
    sellMean: sellStats.mean,
    sellSigma: sellStats.sigma,
    buyMean: buyStats.mean,
    buySigma: buyStats.sigma,
  };
}
