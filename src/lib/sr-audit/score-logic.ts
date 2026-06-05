import { SR_EVENT_TIMEOUT_MS } from "@/lib/sr-audit/constants";
import type { SrResolveReason, SrZoneEvent } from "@/lib/sr-audit/types";

export interface SrScoreCandle {
  time: number;
  high: number;
  low: number;
}

function candlesSinceEvent(candles: SrScoreCandle[], eventAtIso: string): SrScoreCandle[] {
  const fromSec = Math.floor(Date.parse(eventAtIso) / 1000);
  if (!Number.isFinite(fromSec)) return candles;
  return candles.filter((c) => c.time >= fromSec);
}

export interface SrScoreResult {
  maxFavorablePct: number;
  maxAdversePct: number;
  hitPoc: boolean;
  resolveReason: SrResolveReason;
  resolvedAt: string;
}

export function scoreEventFromCandles(
  event: Pick<
    SrZoneEvent,
    "side" | "entrySpot" | "invalidation" | "maxPain" | "eventAt"
  >,
  candles: SrScoreCandle[],
  opts?: {
    forceReason?: SrResolveReason;
    resolvedAt?: string;
  },
): SrScoreResult | null {
  const bars = candlesSinceEvent(candles, event.eventAt);
  if (!bars.length) return null;

  const entry = event.entrySpot;
  if (!Number.isFinite(entry) || entry <= 0) return null;

  let maxFavorablePct = 0;
  let maxAdversePct = 0;
  let hitPoc = false;
  let resolveReason: SrResolveReason | null = null;
  let resolvedAt: string | null = null;

  for (const bar of bars) {
    if (event.side === "support") {
      maxFavorablePct = Math.max(
        maxFavorablePct,
        ((bar.high - entry) / entry) * 100,
      );
      maxAdversePct = Math.max(maxAdversePct, ((entry - bar.low) / entry) * 100);
      if (event.maxPain != null && bar.high >= event.maxPain) hitPoc = true;
      if (event.invalidation != null && bar.low <= event.invalidation) {
        resolveReason = "invalidation";
        resolvedAt = new Date(bar.time * 1000).toISOString();
        break;
      }
    } else {
      maxFavorablePct = Math.max(
        maxFavorablePct,
        ((entry - bar.low) / entry) * 100,
      );
      maxAdversePct = Math.max(maxAdversePct, ((bar.high - entry) / entry) * 100);
      if (event.maxPain != null && bar.low <= event.maxPain) hitPoc = true;
      if (event.invalidation != null && bar.high >= event.invalidation) {
        resolveReason = "invalidation";
        resolvedAt = new Date(bar.time * 1000).toISOString();
        break;
      }
    }
  }

  if (opts?.forceReason) {
    resolveReason = opts.forceReason;
    resolvedAt = opts.resolvedAt ?? new Date().toISOString();
  } else if (!resolveReason) {
    const elapsed = Date.now() - Date.parse(event.eventAt);
    if (Number.isFinite(elapsed) && elapsed >= SR_EVENT_TIMEOUT_MS) {
      resolveReason = "timeout";
      resolvedAt = new Date().toISOString();
    }
  }

  if (!resolveReason || !resolvedAt) return null;

  return {
    maxFavorablePct,
    maxAdversePct,
    hitPoc,
    resolveReason,
    resolvedAt,
  };
}
