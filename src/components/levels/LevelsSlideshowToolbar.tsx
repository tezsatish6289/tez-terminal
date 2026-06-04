"use client";

import type { ReactNode } from "react";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";
import { LevelsChartShortcuts } from "@/components/levels/LevelsChartShortcuts";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { PocDirectionFilter } from "@/lib/zones/zone-status";

const FILTER_OPTIONS: { key: PocDirectionFilter; label: string }[] = [
  { key: "all", label: "All aligned" },
  { key: "bull", label: "In bull · POC above" },
  { key: "bear", label: "In bear · POC below" },
];

export function LevelsSlideshowToolbar({
  zoneFilter,
  onZoneFilterChange,
  countLabel,
  chartShortcuts,
  trailing,
}: {
  zoneFilter: PocDirectionFilter;
  onZoneFilterChange: (filter: PocDirectionFilter) => void;
  countLabel?: string;
  chartShortcuts?: {
    webChartUrl: string;
    showSqueeze?: boolean;
    squeezed?: boolean;
    onSqueeze?: () => void;
    showSlideshowControl?: boolean;
    slideshowPaused?: boolean;
    onToggleSlideshowPause?: () => void;
  } | null;
  trailing?: ReactNode;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-2 mb-2 px-0.5">
      {FILTER_OPTIONS.map(({ key, label }) => {
        const active = zoneFilter === key;
        const bull = key === "bull";
        const bear = key === "bear";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onZoneFilterChange(key)}
            className={`inline-flex items-center px-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-md text-[9px] font-bold uppercase tracking-wide transition-all shrink-0`}
            style={
              active
                ? {
                    backgroundColor: bull
                      ? LEVELS_ZONE_CHART.bull.badgeBg
                      : bear
                        ? LEVELS_ZONE_CHART.bear.badgeBg
                        : "rgba(37,99,235,0.28)",
                    color: bull
                      ? LEVELS_ZONE_CHART.bull.badgeText
                      : bear
                        ? LEVELS_ZONE_CHART.bear.badgeText
                        : "#e2e8f0",
                    border: `1px solid ${bull ? "rgba(52,211,153,0.45)" : bear ? "rgba(248,113,113,0.45)" : "rgba(96,165,250,0.4)"}`,
                  }
                : {
                    backgroundColor: "rgba(0,0,0,0.35)",
                    color: "#64748b",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }
            }
          >
            {label}
          </button>
        );
      })}

      {countLabel ? (
        <span
          className="text-[9px] font-bold uppercase tracking-wide shrink-0"
          style={{ color: "#64748b" }}
        >
          {countLabel}
        </span>
      ) : null}

      {chartShortcuts ? (
        <LevelsChartShortcuts layout="toolbar" {...chartShortcuts} />
      ) : null}

      {trailing ? <div className="ml-auto flex items-center shrink-0">{trailing}</div> : null}
    </div>
  );
}
