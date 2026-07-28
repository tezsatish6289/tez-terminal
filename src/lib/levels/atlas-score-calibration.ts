/**
 * Atlas setup-score → outcome calibration (SR-audit).
 *
 * Win rates are empirical from resolved `sr_zone_events` after the PVT / RR
 * soft-peak recalibration (admin /admin/sr-audit buckets). Used for tooltips
 * on the chart badge — the badge itself shows the composite score, not a
 * per-symbol probability.
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
 * Geographic at/near side for Atlas — ignores OI/RR display gates that can
 * demote an in-zone symbol to Neutral on the status chip.
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
