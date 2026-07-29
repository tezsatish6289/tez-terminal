/**
 * Atlas setup-score → outcome calibration (SR-audit).
 *
 * Win rates are empirical from resolved `sr_zone_events` after the PVT / RR
 * soft-peak recalibration (admin /admin/sr-audit buckets). Chart UI maps
 * composite → ↑/↓ probability via these buckets; score stays visible too.
 */

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { deriveBubbleTone } from "@/lib/zones/bubble-tone";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";

export type AtlasScoreBucketId = "0-49" | "50-69" | "70-100";

export interface AtlasScoreBucket {
  id: AtlasScoreBucketId;
  /** Display label matching the admin calibration cards. */
  label: string;
  min: number;
  max: number;
  /** Historical win rate % for resolved events in this bucket. */
  winRatePct: number;
}

/** Coarse buckets shown on /admin/sr-audit (post Jul 2026 recalibration). */
export const ATLAS_SCORE_BUCKETS: readonly AtlasScoreBucket[] = [
  { id: "0-49", label: "0–49", min: 0, max: 49, winRatePct: 34 },
  { id: "50-69", label: "50–69", min: 50, max: 69, winRatePct: 50 },
  { id: "70-100", label: "70–100", min: 70, max: 100, winRatePct: 72 },
] as const;

export function atlasScoreBucket(score: number): AtlasScoreBucket {
  const s = Math.round(score);
  for (const b of ATLAS_SCORE_BUCKETS) {
    if (s >= b.min && s <= b.max) return b;
  }
  return s < 50 ? ATLAS_SCORE_BUCKETS[0]! : ATLAS_SCORE_BUCKETS[2]!;
}

/** Higher Atlas score → higher calibrated win probability (bucket win rate). */
export function atlasProbabilityPct(score: number): number {
  return atlasScoreBucket(score).winRatePct;
}

/** Badge / accent tone mirroring the admin calibration cards. */
export function atlasScoreTone(score: number): "strong" | "mid" | "weak" {
  if (score >= 70) return "strong";
  if (score >= 50) return "mid";
  return "weak";
}

export function atlasScoreSideFromTone(
  tone: string | null | undefined,
): "support" | "resistance" | null {
  if (tone === "IN_BULL" || tone === "NEAR_BULL") return "support";
  if (tone === "IN_BEAR" || tone === "NEAR_BEAR") return "resistance";
  return null;
}

/**
 * Geographic at/near side — ignores OI/RR display gates that can demote an
 * in-zone symbol to Neutral on the status chip.
 */
export function atlasSideFromLevels(
  levels: PublicLevels | null | undefined,
  spotOverride?: number | null,
): "support" | "resistance" | null {
  if (!levels) return null;
  const bands = bandsFromLevels(levels, spotOverride);
  const scanned = levels.bullLow != null || levels.bearLow != null || levels.spot != null;
  const geo = deriveBubbleTone(bands, scanned);
  return atlasScoreSideFromTone(geo);
}

/** Which probability to visually emphasize on the chart. */
export type AtlasProbEmphasis = "up" | "down" | "both";

export function atlasProbEmphasis(
  geoSide: "support" | "resistance" | null,
): AtlasProbEmphasis {
  if (geoSide === "support") return "up";
  if (geoSide === "resistance") return "down";
  return "both";
}

/** Primary Atlas number: geo side if in/near a zone, else the stronger thesis. */
export function atlasPrimaryScore(
  upScore: number,
  downScore: number,
  geoSide: "support" | "resistance" | null,
): { composite: number; side: "support" | "resistance" } {
  if (geoSide === "support") return { composite: upScore, side: "support" };
  if (geoSide === "resistance") return { composite: downScore, side: "resistance" };
  if (upScore >= downScore) return { composite: upScore, side: "support" };
  return { composite: downScore, side: "resistance" };
}

export interface AtlasSideThesis {
  score: number;
  probabilityPct: number;
  bucket: string;
  bucketWinRatePct: number;
}

export function atlasSideThesis(score: number): AtlasSideThesis {
  const bucket = atlasScoreBucket(score);
  return {
    score: Math.round(score),
    probabilityPct: bucket.winRatePct,
    bucket: bucket.label,
    bucketWinRatePct: bucket.winRatePct,
  };
}
