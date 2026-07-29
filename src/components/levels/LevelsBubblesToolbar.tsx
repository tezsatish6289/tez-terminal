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
  maxPainVisibility,
  atlasQuality,
  viewToggle,
  favslideToggle,
  shareTrailing,
  /** Hide liveslide / favslide CTAs — guest map preview (filters only). */
  hideSlideshowCtas = false,
}: {
  bubbleMapFilter: BubbleMapFilter;
  onBubbleMapFilterChange: (filter: BubbleMapFilter) => void;
  bubbleFilterCounts: Record<BubbleMapFilter, number>;
  maxPainVisibility?: {
    visible: boolean;
    onToggle: () => void;
  };
  atlasQuality?: {
    enabled: boolean;
    onToggle: () => void;
    minScore?: number;
  };
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
  hideSlideshowCtas?: boolean;
}) {
  return (
    <div className={LEVELS_BUBBLE_TOOLBAR_SCROLL_CLASS}>
      <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-none pb-0.5">
        <LevelsBubbleMapFilters
          filter={bubbleMapFilter}
          onFilterChange={onBubbleMapFilterChange}
          counts={bubbleFilterCounts}
          maxPainVisibility={maxPainVisibility}
          atlasQuality={atlasQuality}
        />

        {favslideToggle && !hideSlideshowCtas ? (
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

        {!hideSlideshowCtas ? (
          <LevelsSlideshowCta
            label={viewToggle.label}
            shortLabel={viewToggle.shortLabel}
            onClick={viewToggle.onClick}
            title={viewToggle.title}
            variant={viewToggle.variant}
            kbd={viewToggle.kbd}
            active={viewToggle.active}
          />
        ) : null}

        {shareTrailing}
      </div>
    </div>
  );
}
