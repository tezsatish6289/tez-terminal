/**
 * Liquidity Scorer — pure function, no I/O
 *
 * Combines sweep detection, OI context, and order book context
 * into a 0–40 liquidity score that is added to the 0–60
 * price-structure score in computeAutoFilter (total 0–100).
 *
 * Point allocation (max 42 → capped at 40):
 *   Sweep  — up to 25 pts  (15 SL-zone hit + 6 strength + 4 freshness)
 *   OI     — up to 10 pts  (8 correlation + 2 neutral funding)
 *   OB     — up to  7 pts  (3 imbalance + 2 clear-to-TP1 + 2 protective wall)
 *
 * Also determines sweepGatePassed, used by selectIncubatedSignals
 * to apply a soft gate on crypto signals.
 *
 * Gate semantics:
 *   true      → matching sweep within window, cache fresh
 *   false     → cache fresh, sweep in opposite direction
 *   undefined → cache missing/stale (WS server offline) — no block
 */

import type {
  LiquidityCache,
  LiquidityConfig,
  LiquidityContextScore,
  SweepSide,
} from "./types";
import { DEFAULT_LIQUIDITY_CONFIG } from "./types";
import type { SignalForScoring } from "@/lib/auto-filter";

const MAX_CACHE_AGE_MS = 5 * 60_000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────

function sweepMatchesSignal(
  sweepSide: SweepSide | null,
  signalType: "BUY" | "SELL",
): boolean {
  if (!sweepSide) return false;
  // SELL_LIQ = long positions were liquidated = price dipped below, trapped longs flushed
  //            → bullish context → favours BUY signals
  // BUY_LIQ  = short positions were liquidated = price spiked up, trapped shorts flushed
  //            → bearish context → favours SELL signals
  return (
    (signalType === "BUY" && sweepSide === "SELL_LIQ") ||
    (signalType === "SELL" && sweepSide === "BUY_LIQ")
  );
}

function sweepInSLZone(
  weightedSweepPrice: number | null,
  entryPrice: number,
  stopLoss: number,
  signalType: "BUY" | "SELL",
): boolean {
  if (weightedSweepPrice === null) return false;
  const wp = weightedSweepPrice;
  if (signalType === "BUY") {
    // Longs flushed: sweep price should be at or below entry and at or above SL
    return wp <= entryPrice && wp >= stopLoss;
  } else {
    // Shorts flushed: sweep price should be at or above entry and at or below SL
    return wp >= entryPrice && wp <= stopLoss;
  }
}

// ── Main scorer ───────────────────────────────────────────────

export function scoreLiquidityContext(
  signal: SignalForScoring,
  cache: LiquidityCache | null,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG,
): LiquidityContextScore {
  const noData: LiquidityContextScore = {
    score: 0,
    sweepGatePassed: undefined,
    sweepAgeMs: null,
    reasons: [],
  };

  if (!config.enabled) return noData;
  if (!cache) return noData;

  // Stale cache → behave as if no data (don't block, don't score)
  const cacheAgeMs = Date.now() - new Date(cache.updatedAt).getTime();
  if (cacheAgeMs > MAX_CACHE_AGE_MS) return noData;

  const reasons: string[] = [];
  let score = 0;

  // ── Sweep ────────────────────────────────────────────────────
  const sweep = cache.sweep;
  const now = Date.now();

  const sweepAgeMs =
    sweep.lastSweepAt != null
      ? now - new Date(sweep.lastSweepAt).getTime()
      : null;

  const sweepWithinWindow =
    sweepAgeMs !== null && sweepAgeMs <= config.sweepWindowMs;

  const lastMatchesSide = sweepMatchesSignal(sweep.lastSweepSide, signal.type);

  const slZoneMatch = sweepInSLZone(
    sweep.weightedSweepPrice,
    signal.price,
    signal.stopLoss ?? signal.price,
    signal.type,
  );

  // ── Gate determination ────────────────────────────────────────
  let sweepGatePassed: boolean | undefined;
  if (!config.sweepGateEnabled) {
    sweepGatePassed = undefined;
  } else if (sweepWithinWindow && lastMatchesSide) {
    sweepGatePassed = true;
  } else if (sweepWithinWindow && sweep.lastSweepSide !== null && !lastMatchesSide) {
    // Cache is fresh, a sweep occurred, but it was in the opposite direction
    sweepGatePassed = false;
  } else {
    // No sweep in window — soft penalty via score, no hard block
    sweepGatePassed = undefined;
  }

  // ── Sweep score (max 25 pts) ──────────────────────────────────
  if (config.sweepScoreEnabled) {
    if (sweepWithinWindow && lastMatchesSide) {
      // Matching sweep — primary signal
      if (slZoneMatch) {
        score += 15;
        reasons.push(
          `Sweep in SL zone (${sweep.lastSweepSide}, ${sweep.lastSweepStrength.toFixed(1)}σ)`,
        );
      } else {
        score += 9;
        reasons.push(
          `Sweep detected (${sweep.lastSweepSide}, outside SL zone)`,
        );
      }

      // Strength bonus
      if (sweep.lastSweepStrength > 4) {
        score += 6;
        reasons.push(`Strong spike (${sweep.lastSweepStrength.toFixed(1)}σ)`);
      } else if (sweep.lastSweepStrength >= 2.5) {
        score += 3;
        reasons.push(
          `Moderate spike (${sweep.lastSweepStrength.toFixed(1)}σ)`,
        );
      }

      // Freshness bonus — decaying weight
      if (sweepAgeMs !== null) {
        if (sweepAgeMs < 90_000) {
          score += 4;
          reasons.push(`Fresh sweep (${Math.round(sweepAgeMs / 1000)}s ago)`);
        } else {
          score += 2;
          reasons.push(`Sweep ${Math.round(sweepAgeMs / 1000)}s ago`);
        }
      }
    } else if (
      sweepWithinWindow &&
      sweep.lastSweepSide !== null &&
      !lastMatchesSide
    ) {
      // Active sweep in the wrong direction
      score -= 8;
      reasons.push(`Sweep AGAINST direction (${sweep.lastSweepSide})`);
    } else {
      // No qualifying sweep — soft penalty
      score -= 5;
      reasons.push("No sweep in window");
    }
  }

  // ── OI context (max 10 pts) ───────────────────────────────────
  if (config.oiEnabled && cache.oi) {
    const { priceOICorrelation, fundingRate } = cache.oi;
    const isBuy = signal.type === "BUY";

    // Price-OI correlation: confirms trend conviction
    if (priceOICorrelation > 0.5) {
      if (isBuy) {
        score += 8;
        reasons.push(
          `OI rising with price (r=${priceOICorrelation.toFixed(2)}, bullish)`,
        );
      } else {
        score -= 8;
        reasons.push(
          `OI rising with price (r=${priceOICorrelation.toFixed(2)}, against short)`,
        );
      }
    } else if (priceOICorrelation < -0.5) {
      if (!isBuy) {
        score += 8;
        reasons.push(
          `OI falling with price (r=${priceOICorrelation.toFixed(2)}, bearish)`,
        );
      } else {
        score -= 8;
        reasons.push(
          `OI falling with price (r=${priceOICorrelation.toFixed(2)}, against long)`,
        );
      }
    }

    // Funding rate
    const absRate = Math.abs(fundingRate);
    if (absRate > 0.001) {
      // > 0.1% per 8h — extreme, crowd on one side
      const fundingHurtsSide =
        (isBuy && fundingRate > 0.001) ||
        (!isBuy && fundingRate < -0.001);
      if (fundingHurtsSide) {
        score -= 3;
        reasons.push(
          `Extreme funding (${(fundingRate * 100).toFixed(4)}%) — crowd risk`,
        );
      }
    } else {
      score += 2;
      reasons.push("Neutral funding rate");
    }
  }

  // ── Order book context (max 7 pts) ────────────────────────────
  if (config.obEnabled && cache.ob) {
    const { bands, walls } = cache.ob;
    const isBuy = signal.type === "BUY";
    const structural = bands.structural;
    const sl = signal.stopLoss;
    const cur = signal.currentPrice ?? signal.price;

    // Structural imbalance (±0.3% band around current price).
    // Only counts if current price is safely inside the trade zone —
    // bid support below SL for longs, or ask resistance above SL for
    // shorts, would be unreachable before the stop fires.
    const inTradeZone = sl
      ? (isBuy ? cur > sl : cur < sl)
      : true;

    if (inTradeZone) {
      if (structural.imbalance > 0.15 && isBuy) {
        score += 3;
        reasons.push(
          `Bid support near price (${(structural.imbalance * 100).toFixed(0)}% imbalance)`,
        );
      } else if (structural.imbalance < -0.15 && !isBuy) {
        score += 3;
        reasons.push(
          `Ask pressure near price (${(Math.abs(structural.imbalance) * 100).toFixed(0)}% imbalance)`,
        );
      } else if (structural.imbalance < -0.15 && isBuy) {
        score -= 3;
        reasons.push("Ask heavy near price — resistance");
      } else if (structural.imbalance > 0.15 && !isBuy) {
        score -= 3;
        reasons.push("Bid heavy near price — support ahead of short");
      }
    }

    // Protective wall between SL and current price.
    // For longs: a bid wall above SL and below current price acts as a
    // floor that may catch price before the stop is reached.
    // For shorts: an ask wall below SL and above current price acts as a
    // ceiling that may cap price before the stop is reached.
    // Walls on the wrong side of SL are irrelevant — price would be
    // stopped out before reaching them.
    if (sl) {
      const protectiveWall = walls.find((w) => {
        if (isBuy) {
          return w.side === "bid" && w.price > sl && w.price < cur;
        } else {
          return w.side === "ask" && w.price < sl && w.price > cur;
        }
      });
      if (protectiveWall) {
        score += 2;
        reasons.push(
          `Protective ${isBuy ? "bid" : "ask"} wall between SL and price (${protectiveWall.size.toFixed(1)} lots)`,
        );
      }
    }

    // Wall at TP1 — checks for orders blocking the path to target.
    // For longs: ask wall near TP1 = sellers waiting to absorb price.
    // For shorts: bid wall near TP1 = buyers waiting to push back.
    const tp1 = signal.tp1;
    if (tp1 !== null && tp1 !== undefined) {
      const tp1WallSide = isBuy ? "ask" : "bid";
      const tp1Wall = walls.find((w) => {
        const dist = Math.abs((w.price - tp1) / tp1) * 100;
        return w.side === tp1WallSide && dist <= 0.3;
      });

      if (tp1Wall) {
        score -= 3;
        reasons.push(`Wall blocking TP1 (${tp1Wall.size.toFixed(1)} lots)`);
      } else {
        score += 2;
        reasons.push("Clear path to TP1");
      }
    }
  }

  return {
    score: Math.max(0, Math.min(40, score)),
    sweepGatePassed,
    sweepAgeMs,
    reasons,
  };
}
