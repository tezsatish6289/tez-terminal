"use client";

import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";

const SUMMARY_KEYS = ["IN_BULL", "NEAR_BULL", "IN_BEAR", "NEAR_BEAR"] as const;

type SummaryKey = (typeof SUMMARY_KEYS)[number];

function summaryStyle(key: SummaryKey): {
  labelColor: string;
  countColor: string;
  bg: string;
  border: string;
  borderStyle: "solid" | "dotted";
} {
  const isBull = key === "IN_BULL" || key === "NEAR_BULL";
  const isNear = key === "NEAR_BULL" || key === "NEAR_BEAR";
  const palette = isBull ? LEVELS_ZONE_CHART.bull : LEVELS_ZONE_CHART.bear;
  return {
    labelColor: palette.labelTextMuted,
    countColor: palette.labelText,
    bg: palette.badgeBg,
    border: palette.bandBorder,
    borderStyle: isNear ? "dotted" : "solid",
  };
}

/** Read-only zone setup counts for compact map headers (e.g. homepage embed). */
export function LevelsBubbleToneSummary({
  counts,
}: {
  counts: Record<BubbleMapFilter, number>;
}) {
  return (
    <div
      className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b"
      style={{
        borderColor: "rgba(90,140,220,0.12)",
        backgroundColor: "rgba(8,15,30,0.88)",
      }}
    >
      {SUMMARY_KEYS.map((key) => {
        const style = summaryStyle(key);
        return (
          <div
            key={key}
            className="rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5 min-w-0"
            style={{
              backgroundColor: style.bg,
              border: `1px ${style.borderStyle} ${style.border}`,
            }}
          >
            <p
              className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide truncate"
              style={{ color: style.labelColor }}
            >
              {BUBBLE_TONE_STYLE[key].label}
            </p>
            <p
              className="mt-0.5 text-lg sm:text-xl font-black font-mono tabular-nums leading-none"
              style={{ color: style.countColor }}
            >
              {counts[key]}
            </p>
          </div>
        );
      })}
    </div>
  );
}
