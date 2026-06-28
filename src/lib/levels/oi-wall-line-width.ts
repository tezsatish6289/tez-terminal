/**
 * Cumulative stroke width for History-mode put/call wall lines.
 *
 * Each trading day adjusts width by the **percent** change in that side's wall OI
 * vs the prior day — builds get thicker, decays get thinner (clamped). Using a
 * relative (% ) step instead of absolute contracts makes thickness behave the
 * same for index OI (millions) and single-stock OI (thousands).
 *
 * Dominance glow likewise uses the **percent gap** between put vs call wall OI.
 */

export const OI_WALL_LINE_BASE = 2;
export const OI_WALL_LINE_MIN = 0.75;
export const OI_WALL_LINE_MAX = 7;
/** Width change per 1% of day-over-day OI change (10% build → +0.3 width). */
export const OI_WALL_WIDTH_PER_PCT = 0.03;
/** Per-day width step cap — guards against low-base % noise on illiquid strikes. */
export const OI_WALL_MAX_STEP = 1.5;

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

/**
 * Day-over-day OI **percent** change → width step (pure, scale-invariant).
 * Returns 0 when the prior value is missing or non-positive (can't form a ratio).
 */
export function oiWallWidthStep(prev: number | null | undefined, cur: number | null | undefined): number {
  if (prev == null || cur == null || !Number.isFinite(prev) || !Number.isFinite(cur)) return 0;
  if (prev <= 0) return 0;
  const pctChange = ((cur - prev) / prev) * 100;
  const raw = pctChange * OI_WALL_WIDTH_PER_PCT;
  return Math.max(-OI_WALL_MAX_STEP, Math.min(OI_WALL_MAX_STEP, raw));
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
