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
 * Zone status + Atlas (score + ↑/↓) + IV regime.
 * `stack` — top-right of the chart (desktop / slideshow).
 * `row` — chrome strip: zone + IV on row 1, Atlas ↑/↓ on row 2.
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
  layout = "stack",
  className = "",
}: LevelsChartStatusOverlayProps & {
  rightInsetPx?: number;
  visible?: boolean;
  layout?: "stack" | "row";
  className?: string;
}) {
  if (!visible) return null;

  const showStatus = statusTone != null;
  const showAtlas = atlasSetup != null || (atlasScore != null && Number.isFinite(atlasScore));
  const showVol = volRegime != null && volRegime !== "UNKNOWN";
  if (!showStatus && !showAtlas && !showVol) return null;

  const badgeSize = layout === "row" ? "header" : "chart";

  const statusChip = showStatus ? (
    <LevelsSymbolStatusBadge tone={statusTone} size={badgeSize} />
  ) : null;

  const atlasChip = showAtlas ? (
    <AtlasSetupScoreBadge
      setup={atlasSetup ?? null}
      score={atlasScore ?? undefined}
      size={badgeSize}
      orientation={layout === "row" ? "inline" : "stack"}
    />
  ) : null;

  const volChip = showVol ? (
    <VolRegimeBadge
      flag={volRegime}
      reason={volRegimeReason}
      atmIV={atmIV}
      daysToEarnings={daysToEarnings}
      size={badgeSize}
    />
  ) : null;

  if (layout === "row") {
    return (
      <div
        className={`flex flex-col gap-1.5 min-w-0 ${className}`.trim()}
        aria-label="Symbol status"
      >
        {showStatus || showVol ? (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {statusChip}
            {volChip}
          </div>
        ) : null}
        {atlasChip ? (
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {atlasChip}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute top-2 sm:top-2.5 z-[16] flex flex-col items-end gap-1.5 ${className}`.trim()}
      style={{ right: rightInsetPx + 6 }}
    >
      {statusChip}
      {atlasChip}
      {volChip}
    </div>
  );
}
