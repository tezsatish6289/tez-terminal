"use client";

import { Target, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { BubbleTone } from "@/lib/zones/bubble-tone";

const { bull, bear } = LEVELS_ZONE_CHART;

type ToneBadgeMeta = { label: string; color: string; bg: string; Icon: LucideIcon };

const TONE_BADGE_META: Record<BubbleTone, ToneBadgeMeta> = {
  BULLISH: {
    label: "Bullish",
    color: bull.badgeText,
    bg: "rgba(21, 128, 61, 0.35)",
    Icon: TrendingUp,
  },
  BEARISH: {
    label: "Bearish",
    color: bear.badgeText,
    bg: "rgba(153, 27, 27, 0.35)",
    Icon: TrendingDown,
  },
  IN_BULL: {
    label: "At Support",
    color: bull.badgeText,
    bg: bull.badgeBg,
    Icon: TrendingUp,
  },
  IN_BEAR: {
    label: "At Resistance",
    color: bear.badgeText,
    bg: bear.badgeBg,
    Icon: TrendingDown,
  },
  NEAR_BULL: {
    label: "Near Support",
    color: bull.badgeText,
    bg: bull.bandFillSoft,
    Icon: TrendingUp,
  },
  NEAR_BEAR: {
    label: "Near Resistance",
    color: bear.badgeText,
    bg: bear.bandFillSoft,
    Icon: TrendingDown,
  },
  AT_POC: {
    label: "At Max Pain",
    color: "#fde68a",
    bg: "rgba(245, 158, 11, 0.18)",
    Icon: Target,
  },
  NEUTRAL: {
    label: "Neutral",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    Icon: Target,
  },
  ILLIQUID: {
    label: "No Data",
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
    Icon: Target,
  },
  UNSCANNED: {
    label: "Awaiting scan",
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
    Icon: Target,
  },
};

/** Zone / confirmed-signal pill for slideshow chips and chart headers. */
export function LevelsSymbolStatusBadge({
  tone,
  size = "chip",
  className = "",
}: {
  tone: BubbleTone;
  size?: "chip" | "header" | "chart";
  className?: string;
}) {
  const m = TONE_BADGE_META[tone];
  const Icon = m.Icon;
  const compact = size === "chip";
  const chart = size === "chart";

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-bold uppercase tracking-wide shrink-0 leading-tight ${
        chart
          ? "px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg gap-1"
          : compact
            ? "px-1.5 py-0.5 text-[8px] max-w-[5.75rem] text-right rounded-md"
            : "px-2 py-0.5 text-[9px] sm:text-[10px] rounded-md"
      } ${className}`.trim()}
      style={{ color: m.color, backgroundColor: m.bg }}
      title={m.label}
    >
      <Icon
        className={`${
          chart ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : compact ? "h-2.5 w-2.5" : "h-3 w-3"
        } shrink-0`}
      />
      <span className="truncate">{m.label}</span>
    </span>
  );
}
