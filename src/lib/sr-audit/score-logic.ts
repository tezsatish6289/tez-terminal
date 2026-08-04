import type { SrZoneEvent } from "@/lib/sr-audit/types";

export interface SrScoreCandle {
  time: number;
  high: number;
  low: number;
  close?: number;
}

function candlesSinceEvent(candles: SrScoreCandle[], eventAtIso: string): SrScoreCandle[] {
  const fromSec = Math.floor(Date.parse(eventAtIso) / 1000);
  if (!Number.isFinite(fromSec)) return candles;
  return candles.filter((c) => c.time >= fromSec);
}

export interface SrCandleAnalysis {
  maxFavorablePct: number;
  maxAdversePct: number;
  hitPoc: boolean;
  /** ISO time of the first bar that reached max pain (null if never). */
  pocHitAt: string | null;
  invalidationHit: { resolvedAt: string } | null;
}

/**
 * Walk post-entry candles: update running MFE/MAE/POC and detect invalidation (first bar wins).
 */
export function analyzeCandlesForEvent(
  event: Pick<
    SrZoneEvent,
    "side" | "entrySpot" | "invalidation" | "maxPain" | "eventAt"
  >,
  candles: SrScoreCandle[],
): SrCandleAnalysis | null {
  const bars = candlesSinceEvent(candles, event.eventAt);
  if (!bars.length) return null;

  const entry = event.entrySpot;
  if (!Number.isFinite(entry) || entry <= 0) return null;

  let maxFavorablePct = 0;
  let maxAdversePct = 0;
  let hitPoc = false;
  let pocHitAt: string | null = null;
  let invalidationHit: { resolvedAt: string } | null = null;

  for (const bar of bars) {
    if (event.side === "support") {
      maxFavorablePct = Math.max(
        maxFavorablePct,
        ((bar.high - entry) / entry) * 100,
      );
      maxAdversePct = Math.max(maxAdversePct, ((entry - bar.low) / entry) * 100);
      if (event.maxPain != null && bar.high >= event.maxPain) {
        hitPoc = true;
        if (!pocHitAt) pocHitAt = new Date(bar.time * 1000).toISOString();
      }
      if (
        !invalidationHit &&
        event.invalidation != null &&
        bar.low <= event.invalidation
      ) {
        invalidationHit = { resolvedAt: new Date(bar.time * 1000).toISOString() };
        break;
      }
    } else {
      maxFavorablePct = Math.max(
        maxFavorablePct,
        ((entry - bar.low) / entry) * 100,
      );
      maxAdversePct = Math.max(maxAdversePct, ((bar.high - entry) / entry) * 100);
      if (event.maxPain != null && bar.low <= event.maxPain) {
        hitPoc = true;
        if (!pocHitAt) pocHitAt = new Date(bar.time * 1000).toISOString();
      }
      if (
        !invalidationHit &&
        event.invalidation != null &&
        bar.high >= event.invalidation
      ) {
        invalidationHit = { resolvedAt: new Date(bar.time * 1000).toISOString() };
        break;
      }
    }
  }

  return { maxFavorablePct, maxAdversePct, hitPoc, pocHitAt, invalidationHit };
}

/**
 * Headline MFE from the same bars the success-story chart draws (15-min snapshot).
 * Prefer this over sticky 5-min scoring MFE so the % always matches the replay.
 */
export function mfePctFromStoryBars(
  event: Pick<
    SrZoneEvent,
    "side" | "entrySpot" | "invalidation" | "maxPain" | "eventAt"
  >,
  bars: Array<{ t: number; h: number; l: number; c?: number }>,
): number | null {
  if (!bars.length) return null;
  const analysis = analyzeCandlesForEvent(
    event,
    bars.map((b) => ({
      time: b.t,
      high: b.h,
      low: b.l,
      close: b.c,
    })),
  );
  return analysis ? analysis.maxFavorablePct : null;
}

/** Last candle close after event time — spot fallback when aggregate is stale. */
export function lastCandleCloseSinceEvent(
  candles: SrScoreCandle[],
  eventAtIso: string,
): number | null {
  const bars = candlesSinceEvent(candles, eventAtIso);
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const close = last.close ?? (last.high + last.low) / 2;
  return Number.isFinite(close) && close > 0 ? close : null;
}
