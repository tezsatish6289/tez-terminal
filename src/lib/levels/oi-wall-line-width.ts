/**
 * Cumulative stroke width for History-mode put/call wall lines.
 *
 * Each trading day adjusts width by how much that side's wall OI changed vs the
 * prior day — builds get thicker, decays get thinner (clamped). Progressive
 * multi-day OI builds therefore produce a visibly heavier line.
 */

export const OI_WALL_LINE_BASE = 2;
export const OI_WALL_LINE_MIN = 0.75;
export const OI_WALL_LINE_MAX = 7;
/** Width change per 1M contracts of day-over-day OI delta. */
export const OI_WALL_WIDTH_PER_M = 0.45;

function clamp(w: number): number {
  return Math.max(OI_WALL_LINE_MIN, Math.min(OI_WALL_LINE_MAX, w));
}

/** Day-over-day OI delta → width step (pure). */
export function oiWallWidthStep(prev: number | null | undefined, cur: number | null | undefined): number {
  if (prev == null || cur == null || !Number.isFinite(prev) || !Number.isFinite(cur)) return 0;
  return ((cur - prev) / 1_000_000) * OI_WALL_WIDTH_PER_M;
}

/**
 * One stroke width per segment (row i−1 → row i). Length = oiSeries.length − 1.
 * Cumulative from {@link OI_WALL_LINE_BASE}.
 */
export function buildOiWallSegmentWidths(oiSeries: readonly (number | null | undefined)[]): number[] {
  let w = OI_WALL_LINE_BASE;
  const out: number[] = [];
  for (let i = 1; i < oiSeries.length; i++) {
    w += oiWallWidthStep(oiSeries[i - 1], oiSeries[i]);
    w = clamp(w);
    out.push(w);
  }
  return out;
}
