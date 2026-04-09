/**
 * Liquidity Scorer — pure function, no I/O
 *
 * Combines sweep detection, OI context, and order book context
 * into a 0–20 liquidity score that is added to the existing 0–80
 * price-structure score in computeAutoFilter.
 *
 * Also determines sweepGatePassed, used by selectIncubatedSignals
 * to apply a soft gate on crypto signals.
 *
 * Gate semantics:
 *   true      → matching sweep within window, cache fresh
 *   false     → cache fresh, no matching sweep found
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

  // ── Sweep score ───────────────────────────────────────────────
  if (config.sweepScoreEnabled) {
    if (sweepWithinWindow && lastMatchesSide) {
      // Matching sweep — primary signal
      if (slZoneMatch) {
        score += 10;
        reasons.push(
          `Sweep in SL zone (${sweep.lastSweepSide}, ${sweep.lastSweepStrength.toFixed(1)}σ)`,
        );
      } else {
        score += 6;
        reasons.push(
          `Sweep detected (${sweep.lastSweepSide}, outside SL zone)`,
        );
      }

      // Strength bonus — replaces lower tier, not additive
      if (sweep.lastSweepStrength > 4) {
        score += 4;
        reasons.push(`Strong spike (${sweep.lastSweepStrength.toFixed(1)}σ)`);
      } else if (sweep.lastSweepStrength >= 2.5) {
        score += 2;
        reasons.push(
          `Moderate spike (${sweep.lastSweepStrength.toFixed(1)}σ)`,
        );
      }

      // Freshness bonus — decaying weight
      if (sweepAgeMs !== null) {
        if (sweepAgeMs < 90_000) {
          score += 3;
          reasons.push(`Fresh sweep (${Math.round(sweepAgeMs / 1000)}s ago)`);
        } else {
          score += 1;
          reasons.push(`Sweep ${Math.round(sweepAgeMs / 1000)}s ago`);
        }
      }
    } else if (
      sweepWithinWindow &&
      sweep.lastSweepSide !== null &&
      !lastMatchesSide
    ) {
      // Active sweep in the wrong direction
      score -= 6;
      reasons.push(`Sweep AGAINST direction (${sweep.lastSweepSide})`);
    } else {
      // No qualifying sweep — soft penalty
      score -= 4;
      reasons.push("No sweep in window");
    }
  }

  // ── OI context ────────────────────────────────────────────────
  if (config.oiEnabled && cache.oi) {
    const { priceOICorrelation, fundingRate } = cache.oi;
    const isBuy = signal.type === "BUY";

    // Price-OI correlation: confirms trend conviction
    if (priceOICorrelation > 0.5) {
      if (isBuy) {
        score += 3;
        reasons.push(
          `OI rising with price (r=${priceOICorrelation.toFixed(2)}, bullish)`,
        );
      } else {
        score -= 3;
        reasons.push(
          `OI rising with price (r=${priceOICorrelation.toFixed(2)}, against short)`,
        );
      }
    } else if (priceOICorrelation < -0.5) {
      if (!isBuy) {
        score += 3;
        reasons.push(
          `OI falling with price (r=${priceOICorrelation.toFixed(2)}, bearish)`,
        );
      } else {
        score -= 3;
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
        score -= 2;
        reasons.push(
          `Extreme funding (${(fundingRate * 100).toFixed(4)}%) — crowd risk`,
        );
      }
    } else {
      score += 1;
      reasons.push("Neutral funding rate");
    }
  }

  // ── Order book context ────────────────────────────────────────
  if (config.obEnabled && cache.ob) {
    const { bands, walls } = cache.ob;
    const isBuy = signal.type === "BUY";
    const structural = bands.structural;

    // Structural band imbalance (±0.3%)
    if (structural.imbalance > 0.15 && isBuy) {
      score += 2;
      reasons.push(
        `Bid support (${(structural.imbalance * 100).toFixed(0)}% imbalance)`,
      );
    } else if (structural.imbalance < -0.15 && !isBuy) {
      score += 2;
      reasons.push(
        `Ask pressure (${(Math.abs(structural.imbalance) * 100).toFixed(0)}% imbalance)`,
      );
    } else if (structural.imbalance < -0.15 && isBuy) {
      score -= 2;
      reasons.push("Ask heavy near price — resistance");
    } else if (structural.imbalance > 0.15 && !isBuy) {
      score -= 2;
      reasons.push("Bid heavy near price — support ahead");
    }

    // Wall at TP1
    const tp1 = signal.tp1;
    if (tp1 !== null && tp1 !== undefined) {
      const tp1WallSide = isBuy ? "ask" : "bid";
      const tp1Wall = walls.find((w) => {
        const dist = Math.abs((w.price - tp1) / tp1) * 100;
        return w.side === tp1WallSide && dist <= 0.3;
      });

      if (tp1Wall) {
        score -= 2;
        reasons.push(`Wall at TP1 (${tp1Wall.size.toFixed(2)} lots)`);
      } else {
        score += 2;
        reasons.push("Clear path to TP1 (no wall)");
      }
    }
  }

  return {
    score: Math.max(0, Math.min(20, score)),
    sweepGatePassed,
    sweepAgeMs,
    reasons,
  };
}
