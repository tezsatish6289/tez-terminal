"use client";

import { useMemo, type ReactNode } from "react";
import { LevelsCtaCluster, type LevelsCtaAction } from "@/components/levels/LevelsCtaCluster";
import {
  BUBBLE_MAP_FILTER_KEYS,
  SLIDESHOW_MAP_FILTER_KEYS,
  bubbleMapFilterLabel,
  type BubbleMapFilter,
  type SlideshowMapFilter,
} from "@/lib/zones/bubble-map-filter";
import { trackCtaClick } from "@/firebase/analytics";

function filterTone(
  key: BubbleMapFilter,
  active: boolean,
): LevelsCtaAction["tone"] {
  if (key === "all") return active ? "default" : "default-muted";
  if (key === "AT_POC") return active ? "maxpain" : "maxpain-muted";
  const isBull = key === "BULLISH" || key === "IN_BULL" || key === "NEAR_BULL";
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
  maxPainVisibility?: {
    visible: boolean;
    onToggle: () => void;
  };
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
  maxPainVisibility,
}: BubbleMapFilterProps | SlideshowMapFilterProps) {
  const actions = useMemo((): LevelsCtaAction[] => {
    const opts: { key: BubbleMapFilter; label: string }[] = [
      { key: "all", label: "All" },
      ...filterKeys.map((key) => ({
        key,
        label: bubbleMapFilterLabel(key),
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
        onClick: () => {
          trackCtaClick("map_filter", { label, filter: key });
          onFilterChange(key as BubbleMapFilter & SlideshowMapFilter);
        },
        tone: filterTone(key, active),
        ringStyle: isNear ? ("dotted" as const) : ("solid" as const),
        ariaLabel: `${label}, ${count} symbols`,
        ...(key === "AT_POC" && maxPainVisibility
          ? { maxPainHighlight: maxPainVisibility }
          : {}),
      };
    });
  }, [filter, onFilterChange, counts, filterKeys, maxPainVisibility]);

  return <LevelsCtaCluster actions={actions} align="start" variant="filter" />;
}
