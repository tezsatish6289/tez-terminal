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
  maxPainVisibility?: {
    visible: boolean;
    onToggle: () => void;
  };
  /** Default-on quality gate: hide light Atlas scores at or below minScore. */
  atlasQuality?: {
    enabled: boolean;
    onToggle: () => void;
    minScore?: number;
  };
};

type SlideshowMapFilterProps = {
  filter: SlideshowMapFilter;
  onFilterChange: (next: SlideshowMapFilter) => void;
  counts: Record<SlideshowMapFilter, number>;
  filterKeys?: typeof SLIDESHOW_MAP_FILTER_KEYS;
  atlasQuality?: never;
  maxPainVisibility?: never;
};

export function LevelsBubbleMapFilters(props: BubbleMapFilterProps): ReactNode;
export function LevelsBubbleMapFilters(props: SlideshowMapFilterProps): ReactNode;
export function LevelsBubbleMapFilters({
  filter,
  onFilterChange,
  counts,
  filterKeys = BUBBLE_MAP_FILTER_KEYS,
  maxPainVisibility,
  atlasQuality,
}: BubbleMapFilterProps | SlideshowMapFilterProps) {
  const actions = useMemo((): LevelsCtaAction[] => {
    const opts: { key: BubbleMapFilter; label: string }[] = [
      { key: "all", label: "All" },
      ...filterKeys.map((key) => ({
        key,
        label: bubbleMapFilterLabel(key),
      })),
    ];
    const quality =
      atlasQuality && "enabled" in atlasQuality
        ? (() => {
            const min = atlasQuality.minScore ?? 60;
            const label = `Atlas >${min}`;
            return {
              id: "bubble-filter-atlas-quality",
              label,
              onClick: () => {
                trackCtaClick("map_filter", {
                  label,
                  filter: atlasQuality.enabled ? "atlas_quality_off" : "atlas_quality_on",
                });
                atlasQuality.onToggle();
              },
              tone: (atlasQuality.enabled ? "default" : "default-muted") as LevelsCtaAction["tone"],
              title: atlasQuality.enabled
                ? `Showing setups with light Atlas score above ${min}. Click to show all scores.`
                : `Hide setups with light Atlas score ${min} or below.`,
              ariaLabel: atlasQuality.enabled
                ? `${label} quality filter on`
                : `${label} quality filter off`,
            } satisfies LevelsCtaAction;
          })()
        : null;
    const toneActions = opts.map(({ key, label }) => {
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
    // All · Atlas >60 · tone filters — quality sits next to All for less hunting.
    return quality ? [toneActions[0]!, quality, ...toneActions.slice(1)] : toneActions;
  }, [filter, onFilterChange, counts, filterKeys, maxPainVisibility, atlasQuality]);

  return <LevelsCtaCluster actions={actions} align="start" variant="filter" />;
}
