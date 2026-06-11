"use client";

import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import {
  LevelsSlideshowCta,
  type LevelsSlideCtaVariant,
} from "@/components/levels/LevelsSlideshowCta";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";

/** One row: tone filters · slideshow CTAs (all h-7 chips). */
export function LevelsBubblesToolbar({
  bubbleMapFilter,
  onBubbleMapFilterChange,
  bubbleFilterCounts,
  viewToggle,
  favslideToggle,
}: {
  bubbleMapFilter: BubbleMapFilter;
  onBubbleMapFilterChange: (filter: BubbleMapFilter) => void;
  bubbleFilterCounts: Record<BubbleMapFilter, number>;
  viewToggle: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
    title?: string;
    variant: LevelsSlideCtaVariant;
    kbd: string;
    active?: boolean;
  };
  favslideToggle?: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
    title?: string;
    variant: LevelsSlideCtaVariant;
    kbd: string;
    active?: boolean;
  };
}) {
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 mb-2 px-0.5 min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
    >
      <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LevelsBubbleMapFilters
          filter={bubbleMapFilter}
          onFilterChange={onBubbleMapFilterChange}
          counts={bubbleFilterCounts}
        />
      </div>

      {favslideToggle ? (
        <LevelsSlideshowCta
          label={favslideToggle.label}
          shortLabel={favslideToggle.shortLabel}
          onClick={favslideToggle.onClick}
          title={favslideToggle.title}
          variant={favslideToggle.variant}
          kbd={favslideToggle.kbd}
          active={favslideToggle.active}
        />
      ) : null}

      <LevelsSlideshowCta
        label={viewToggle.label}
        shortLabel={viewToggle.shortLabel}
        onClick={viewToggle.onClick}
        title={viewToggle.title}
        variant={viewToggle.variant}
        kbd={viewToggle.kbd}
        active={viewToggle.active}
      />
    </div>
  );
}
