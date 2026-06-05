"use client";

import { useMemo, type ReactNode } from "react";
import { LevelsCtaCluster, type LevelsCtaAction } from "@/components/levels/LevelsCtaCluster";
import {
  BUBBLE_MAP_FILTER_KEYS,
  SLIDESHOW_MAP_FILTER_KEYS,
  type BubbleMapFilter,
  type SlideshowMapFilter,
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

type BubbleMapFilterProps = {
  filter: BubbleMapFilter;
  onFilterChange: (next: BubbleMapFilter) => void;
  counts: Record<BubbleMapFilter, number>;
  filterKeys?: typeof BUBBLE_MAP_FILTER_KEYS;
};

type SlideshowMapFilterProps = {
  filter: SlideshowMapFilter;
  onFilterChange: (next: SlideshowMapFilter) => void;
  counts: Record<SlideshowMapFilter, number>;
  filterKeys?: typeof SLIDESHOW_MAP_FILTER_KEYS;
};

export function LevelsBubbleMapFilters(props: BubbleMapFilterProps): ReactNode;
export function LevelsBubbleMapFilters(props: SlideshowMapFilterProps): ReactNode;
export function LevelsBubbleMapFilters({
  filter,
  onFilterChange,
  counts,
  filterKeys = BUBBLE_MAP_FILTER_KEYS,
}: BubbleMapFilterProps | SlideshowMapFilterProps) {
  const actions = useMemo((): LevelsCtaAction[] => {
    const opts: { key: BubbleMapFilter; label: string }[] = [
      { key: "all", label: "All" },
      ...filterKeys.map((key) => ({
        key,
        label: BUBBLE_TONE_STYLE[key].label,
      })),
    ];
    return opts.map(({ key, label }) => {
      const active = filter === key;
      const count = counts[key as keyof typeof counts] ?? 0;
      const isNear = key === "NEAR_BULL" || key === "NEAR_BEAR";
      return {
        id: `bubble-filter-${key}`,
        label,
        count,
        onClick: () => onFilterChange(key as BubbleMapFilter & SlideshowMapFilter),
        tone: filterTone(key, active),
        ringStyle: isNear ? ("dotted" as const) : ("solid" as const),
        ariaLabel: `${label}, ${count} symbols`,
      };
    });
  }, [filter, onFilterChange, counts, filterKeys]);

  return <LevelsCtaCluster actions={actions} align="start" variant="filter" />;
}
