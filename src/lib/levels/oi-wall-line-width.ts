/**
 * Cumulative stroke width for History-mode put/call wall lines.
 *
 * Each trading day adjusts width by how much that side's wall OI changed vs the
 * prior day — builds get thicker, decays get thinner (clamped). Progressive
 * multi-day OI builds therefore produce a visibly heavier line.
 *
 * Dominance glow uses **percent gap** between put vs call wall OI (works for
 * index millions and stock thousands alike).
 */

export const OI_WALL_LINE_BASE = 2;
export const OI_WALL_LINE_MIN = 0.75;
export const OI_WALL_LINE_MAX = 7;
/** Width change per 1M contracts of day-over-day OI delta. */
export const OI_WALL_WIDTH_PER_M = 0.45;

/** % gap below which neither side glows (roughly balanced). */
export const OI_WALL_GLOW_MIN_PCT = 2;

/** Maps dominance % → glow strength 0–1 (continuous, scale-invariant). */
export function oiWallGlowStrength(pct: number): number {
  if (pct < OI_WALL_GLOW_MIN_PCT) return 0;
  // 2% → ~0.2, 25% → ~0.65, 50%+ → 1
  return Math.min(1, 0.2 + ((pct - OI_WALL_GLOW_MIN_PCT) / 48) * 0.8);
}

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

export type OiWallSide = "put" | "call";

/**
 * Percent gap between put and call wall OI at a point: |put−call| / max(put,call) × 100.
 * Pure — scale-invariant (NIFTY millions vs stock thousands).
 */
export function oiWallDominancePct(
  putOI: number | null | undefined,
  callOI: number | null | undefined,
): number {
  if (putOI == null || callOI == null || !Number.isFinite(putOI) || !Number.isFinite(callOI)) return 0;
  const hi = Math.max(putOI, callOI);
  if (hi <= 0) return 0;
  return (Math.abs(putOI - callOI) / hi) * 100;
}

/** Which wall carries more OI; tie when equal or missing. */
export function oiWallDominantSide(
  putOI: number | null | undefined,
  callOI: number | null | undefined,
): OiWallSide | "tie" {
  if (putOI == null || callOI == null || !Number.isFinite(putOI) || !Number.isFinite(callOI)) return "tie";
  if (putOI > callOI) return "put";
  if (callOI > putOI) return "call";
  return "tie";
}

/** Glow tiers 0–4 from % dominance gap (0 = no glow). */
export function oiWallGlowTier(pct: number): number {
  const s = oiWallGlowStrength(pct);
  if (s <= 0) return 0;
  if (s < 0.35) return 1;
  if (s < 0.55) return 2;
  if (s < 0.75) return 3;
  return 4;
}
