"use client";

import type { ReactNode } from "react";
import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import {
  LevelsSlideshowCta,
  type LevelsSlideCtaVariant,
} from "@/components/levels/LevelsSlideshowCta";
import { LEVELS_BUBBLE_TOOLBAR_SCROLL_CLASS } from "@/components/levels/levels-symbol-strip";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";

/** One row: tone filters · slideshow CTAs (all h-7 chips). */
export function LevelsBubblesToolbar({
  bubbleMapFilter,
  onBubbleMapFilterChange,
  bubbleFilterCounts,
  viewToggle,
  favslideToggle,
  shareTrailing,
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
  shareTrailing?: ReactNode;
}) {
  return (
    <div className={LEVELS_BUBBLE_TOOLBAR_SCROLL_CLASS}>
      <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-none pb-0.5">
        <LevelsBubbleMapFilters
          filter={bubbleMapFilter}
          onFilterChange={onBubbleMapFilterChange}
          counts={bubbleFilterCounts}
        />

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

        {shareTrailing}
      </div>
    </div>
  );
}
