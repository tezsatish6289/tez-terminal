/**
 * Light Atlas setup score for the bubble map — same formula as
 * `/api/freedombot/levels/score`, but only from fields already on the levels
 * payload (no PVT candle fetch, no IV-history percentile).
 *
 * Used to hide weak setups (default: score ≤ 60) without N score API calls.
 */

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  atlasPrimaryScore,
  atlasScoreSideFromTone,
  atlasSideFromLevels,
} from "@/lib/levels/atlas-score-calibration";
import {
  scoreDirectionalSetup,
  type ScoreInputs,
} from "@/lib/levels/strategy-score";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import { pocRiskRewardRatio } from "@/lib/zones/zone-status";

/** Map default: hide setups at or below this light Atlas score. */
export const LIGHT_ATLAS_MAP_MIN_SCORE = 60;

function oiChangePct(oi: number | null | undefined, change: number | null | undefined): number | null {
  if (oi == null || change == null) return null;
  const prior = oi - change;
  if (prior <= 0) return null;
  return Math.round((change / prior) * 1000) / 10;
}

function daysUntilExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const m = expiry.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const target = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** ScoreInputs from PublicLevels — PVT + IV percentile left null (renormalised). */
export function scoreInputsFromPublicLevels(levels: PublicLevels): ScoreInputs {
  const putOi = levels.putClusterSize ?? null;
  const callOi = levels.callClusterSize ?? null;
  return {
    spot: levels.spot ?? null,
    maxPain: levels.poc ?? null,
    supportLow: levels.bullLow ?? null,
    supportHigh: levels.bullHigh ?? null,
    resistanceLow: levels.bearLow ?? null,
    resistanceHigh: levels.bearHigh ?? null,
    putWallStrike: levels.putClusterStrike ?? null,
    putWallSize: putOi,
    callWallStrike: levels.callClusterStrike ?? null,
    callWallSize: callOi,
    atmIV: levels.atmIV ?? null,
    ivPercentile: null,
    volRegimeFlag: levels.volRegime ?? null,
    daysToExpiry: daysUntilExpiry(levels.zonesExpiry),
    daysToEarnings: levels.daysToEarnings ?? null,
    putOiChangePct: levels.oi?.putDeltaPct ?? oiChangePct(putOi, levels.putClusterChange),
    callOiChangePct: levels.oi?.callDeltaPct ?? oiChangePct(callOi, levels.callClusterChange),
    newsScore: null,
    pvtSlope: null,
  };
}

export type LightAtlasResult = {
  composite: number;
  side: "support" | "resistance";
  up: number;
  down: number;
};

/**
 * Primary light Atlas score for map filtering.
 * Geo side when in/near a zone; otherwise the stronger of ↑/↓ theses.
 */
export function computeLightAtlasScore(
  levels: PublicLevels | null | undefined,
  tone?: string | null,
): LightAtlasResult | null {
  if (!levels) return null;
  if (levels.spot == null && levels.poc == null) return null;
  if (levels.bullLow == null && levels.bearLow == null && levels.spot == null) return null;

  const inputs = scoreInputsFromPublicLevels(levels);
  const bands = bandsFromLevels(levels);
  const bandOffset = levels.bandOffset ?? null;
  const rrSupport =
    inputs.maxPain != null ? pocRiskRewardRatio(bands, inputs.maxPain, bandOffset, "bull") : null;
  const rrResist =
    inputs.maxPain != null ? pocRiskRewardRatio(bands, inputs.maxPain, bandOffset, "bear") : null;

  const up = scoreDirectionalSetup("support", inputs, { riskReward: rrSupport }).composite;
  const down = scoreDirectionalSetup("resistance", inputs, { riskReward: rrResist }).composite;
  const geoSide =
    atlasScoreSideFromTone(tone) ?? atlasSideFromLevels(levels);
  const primary = atlasPrimaryScore(up, down, geoSide);
  return {
    composite: Math.round(primary.composite),
    side: primary.side,
    up: Math.round(up),
    down: Math.round(down),
  };
}

/** Whether a bubble should stay on the map under the light Atlas quality gate. */
export function passesLightAtlasMapGate(
  item: { kind?: string; atlasScore?: number | null },
  enabled: boolean,
  minScore: number = LIGHT_ATLAS_MAP_MIN_SCORE,
): boolean {
  if (!enabled) return true;
  if (item.kind === "mmi") return true;
  return item.atlasScore != null && item.atlasScore > minScore;
}
