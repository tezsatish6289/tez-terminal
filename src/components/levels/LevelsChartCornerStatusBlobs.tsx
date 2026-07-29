"use client";

import {
  AtlasSetupScoreBadge,
  type AtlasChartSetup,
} from "@/components/levels/AtlasSetupScoreBadge";
import { LevelsSymbolStatusBadge } from "@/components/levels/LevelsSymbolStatusBadge";
import { VolRegimeBadge } from "@/components/levels/VolRegimeBadge";
import type { BubbleTone } from "@/lib/zones/bubble-tone";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";

export type LevelsChartStatusOverlayProps = {
  statusTone?: BubbleTone | null;
  volRegime?: VolRegimeFlag | null;
  volRegimeReason?: string | null;
  atmIV?: number | null;
  daysToEarnings?: number | null;
  /** @deprecated Prefer `atlasSetup` (score + ↑/↓ probs). */
  atlasScore?: number | null;
  atlasSetup?: AtlasChartSetup | null;
};

const DEFAULT_RIGHT_INSET_PX = 100;

/**
 * Zone status + Atlas (score + ↑/↓) + IV regime blobs anchored to the
 * top-right of the chart grid, just left of the right price scale.
 */
export function LevelsChartCornerStatusBlobs({
  statusTone,
  volRegime,
  volRegimeReason,
  atmIV,
  daysToEarnings,
  atlasScore,
  atlasSetup,
  rightInsetPx = DEFAULT_RIGHT_INSET_PX,
  visible = true,
}: LevelsChartStatusOverlayProps & {
  rightInsetPx?: number;
  visible?: boolean;
}) {
  if (!visible) return null;

  const showStatus = statusTone != null;
  const showAtlas = atlasSetup != null || (atlasScore != null && Number.isFinite(atlasScore));
  const showVol = volRegime != null && volRegime !== "UNKNOWN";
  if (!showStatus && !showAtlas && !showVol) return null;

  return (
    <div
      className="pointer-events-none absolute top-2 sm:top-2.5 z-[16] flex flex-col items-end gap-1.5"
      style={{ right: rightInsetPx + 6 }}
    >
      {showStatus ? <LevelsSymbolStatusBadge tone={statusTone} size="chart" /> : null}
      {showAtlas ? (
        <AtlasSetupScoreBadge setup={atlasSetup ?? null} score={atlasScore ?? undefined} size="chart" />
      ) : null}
      {showVol ? (
        <VolRegimeBadge
          flag={volRegime}
          reason={volRegimeReason}
          atmIV={atmIV}
          daysToEarnings={daysToEarnings}
          size="chart"
        />
      ) : null}
    </div>
  );
}
