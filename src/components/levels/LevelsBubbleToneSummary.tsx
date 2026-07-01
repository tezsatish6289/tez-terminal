"use client";

import { useMemo } from "react";
import {
  LevelsCtaCluster,
  type LevelsCtaAction,
} from "@/components/levels/LevelsCtaCluster";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";

const SUMMARY_KEYS = ["IN_BULL", "NEAR_BULL", "IN_BEAR", "NEAR_BEAR"] as const;

export type BubbleToneSummaryKey = (typeof SUMMARY_KEYS)[number];

/** Read-only zone setup counts for compact map headers (e.g. homepage embed). */
export function LevelsBubbleToneSummary({
  counts,
  activeKey = null,
}: {
  counts: Record<BubbleMapFilter, number>;
  /** Highlights the pill matching the landing-page showcase step. */
  activeKey?: BubbleToneSummaryKey | null;
}) {
  const actions = useMemo((): LevelsCtaAction[] => {
    return SUMMARY_KEYS.map((key) => {
      const isBull = key === "IN_BULL" || key === "NEAR_BULL";
      const isNear = key === "NEAR_BULL" || key === "NEAR_BEAR";
      const highlighted = key === activeKey;
      return {
        id: `summary-${key}`,
        label: BUBBLE_TONE_STYLE[key].label,
        count: counts[key],
        static: true,
        tone: highlighted
          ? isBull
            ? "bull"
            : "bear"
          : isBull
            ? "bull-muted"
            : "bear-muted",
        ringStyle: isNear ? "dotted" : "solid",
      };
    });
  }, [counts, activeKey]);

  return (
    <div
      className="shrink-0 flex items-center px-3 py-2 sm:px-4 sm:py-2.5 border-b overflow-x-auto"
      style={{
        borderColor: "rgba(90,140,220,0.12)",
        backgroundColor: "rgba(8,15,30,0.88)",
      }}
    >
      <LevelsCtaCluster actions={actions} align="start" variant="filter" />
    </div>
  );
}
