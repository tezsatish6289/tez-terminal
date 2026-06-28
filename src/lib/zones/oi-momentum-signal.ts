/**
 * Day-over-day OI-wall momentum signal — the same encoding the History chart
 * shows (line thickness = OI build, glow = put/call dominance), distilled to a
 * few scale-invariant numbers the bubble-map / liveslide filter can gate on.
 *
 * Pure + dependency-light so it runs identically on server (zone cron) and is
 * trivially unit-testable. Strike alignment is intentionally ignored: we compare
 * consecutive days' put-wall OI and call-wall OI directly (Option A), matching
 * how the History chart draws thickness.
 */

import {
  oiWallDominancePct,
  oiWallDominantSide,
  type OiWallSide,
} from "@/lib/levels/oi-wall-line-width";

/** Minimal OI-wall fields the signal needs from a daily snapshot entry. */
export interface OiWallPoint {
  putOI: number | null;
  callOI: number | null;
}

/** Compact per-symbol momentum signal stored on zone docs. */
export interface OiWallMomentum {
  /** Latest snapshot date (YYYY-MM-DD) the signal was computed from. */
  asOf: string;
  /** Prior snapshot date used for the day-over-day delta. */
  prevDate: string;
  /** Day-over-day % change in put-wall OI (support side). Null when not derivable. */
  putDeltaPct: number | null;
  /** Day-over-day % change in call-wall OI (resistance side). Null when not derivable. */
  callDeltaPct: number | null;
  /** Put-vs-call dominance gap at the latest day (0–100, scale-invariant). */
  dominancePct: number;
  /** Which wall carries more OI at the latest day. */
  dominantSide: OiWallSide | "tie";
}

/** Day-over-day percent change; null when the prior value can't form a ratio. */
export function oiPctChange(prev: number | null | undefined, cur: number | null | undefined): number | null {
  if (prev == null || cur == null || !Number.isFinite(prev) || !Number.isFinite(cur)) return null;
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10; // 1 decimal place
}

/**
 * Build the momentum signal for one symbol from its latest + prior day points.
 * Returns null when the latest day has no usable wall OI at all.
 */
export function computeOiWallMomentum(
  latest: OiWallPoint,
  prev: OiWallPoint | null | undefined,
  asOf: string,
  prevDate: string,
): OiWallMomentum | null {
  const hasLatest =
    (latest.putOI != null && Number.isFinite(latest.putOI)) ||
    (latest.callOI != null && Number.isFinite(latest.callOI));
  if (!hasLatest) return null;

  return {
    asOf,
    prevDate,
    putDeltaPct: oiPctChange(prev?.putOI, latest.putOI),
    callDeltaPct: oiPctChange(prev?.callOI, latest.callOI),
    dominancePct: Math.round(oiWallDominancePct(latest.putOI, latest.callOI) * 10) / 10,
    dominantSide: oiWallDominantSide(latest.putOI, latest.callOI),
  };
}

/**
 * Compute momentum signals for every symbol present in the latest snapshot map.
 * `prevMap` supplies the prior day; symbols missing there get null deltas but
 * still get a dominance reading.
 */
export function computeOiWallMomentumMap(
  latestMap: Record<string, OiWallPoint>,
  prevMap: Record<string, OiWallPoint>,
  asOf: string,
  prevDate: string,
): Record<string, OiWallMomentum> {
  const out: Record<string, OiWallMomentum> = {};
  for (const [symbol, latest] of Object.entries(latestMap)) {
    const sig = computeOiWallMomentum(latest, prevMap[symbol] ?? null, asOf, prevDate);
    if (sig) out[symbol] = sig;
  }
  return out;
}
