"use client";

import { useMemo } from "react";
import { LevelsCtaCluster, type LevelsCtaAction } from "@/components/levels/LevelsCtaCluster";
import {
  BUBBLE_MAP_FILTER_KEYS,
  type BubbleMapFilter,
} from "@/lib/zones/bubble-map-filter";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";

function filterTone(
  key: BubbleMapFilter,
  active: boolean,
): LevelsCtaAction["tone"] {
  if (key === "all") return active ? "default" : "default-muted";
  const isBull = key === "IN_BULL" || key === "NEAR_BULL";
  if (active) return isBull ? "bull" : key === "UNSCANNED" ? "default" : "bear";
  if (isBull) return "bull-muted";
  if (key === "UNSCANNED") return "default-muted";
  return "bear-muted";
}

export function LevelsBubbleMapFilters({
  filter,
  onFilterChange,
  counts,
}: {
  filter: BubbleMapFilter;
  onFilterChange: (next: BubbleMapFilter) => void;
  counts: Record<BubbleMapFilter, number>;
}) {
  const actions = useMemo((): LevelsCtaAction[] => {
    const opts: { key: BubbleMapFilter; label: string }[] = [
      { key: "all", label: "All" },
      ...BUBBLE_MAP_FILTER_KEYS.map((key) => ({
        key,
        label: BUBBLE_TONE_STYLE[key].label,
      })),
    ];
    return opts.map(({ key, label }) => {
      const active = filter === key;
      return {
        id: `bubble-filter-${key}`,
        label,
        count: counts[key],
        onClick: () => onFilterChange(key),
        tone: filterTone(key, active),
        ariaLabel: `${label}, ${counts[key]} symbols`,
      };
    });
  }, [filter, onFilterChange, counts]);

  return <LevelsCtaCluster actions={actions} align="start" />;
}
