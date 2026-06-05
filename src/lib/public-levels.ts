import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";

/** Map a simulator/crypto suggested-zones snapshot to the neutral public shape. */
export function toPublicLevels(
  raw: SuggestedZonesSnapshot | null | undefined,
  spotOverride?: number | null,
): PublicLevels | null {
  if (!raw) return null;
  return {
    spot: spotOverride ?? raw.deribitIndexPrice ?? raw.btcPrice ?? null,
    poc: raw.maxPain,
    bullLow: raw.bullZoneLow,
    bullHigh: raw.bullZoneHigh,
    bearLow: raw.bearZoneLow,
    bearHigh: raw.bearZoneHigh,
    bandOffset: raw.halfWidthUsd ?? null,
    bullActive: raw.bullActionable ?? null,
    bearActive: raw.bearActionable ?? null,
    computedAt: raw.computedAt ?? null,
    unavailable: false,
    levelsSource: null,
  };
}
