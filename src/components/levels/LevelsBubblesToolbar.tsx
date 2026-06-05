"use client";

import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import { LevelsSlideshowCta } from "@/components/levels/LevelsSlideshowCta";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";

/** One row: search · tone filters · slideshow CTA (all h-7 chips). */
export function LevelsBubblesToolbar({
  search,
  onSearchChange,
  bubbleMapFilter,
  onBubbleMapFilterChange,
  bubbleFilterCounts,
  viewToggle,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  bubbleMapFilter: BubbleMapFilter;
  onBubbleMapFilterChange: (filter: BubbleMapFilter) => void;
  bubbleFilterCounts: Record<BubbleMapFilter, number>;
  viewToggle: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
    title?: string;
  };
}) {
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 mb-2 px-0.5 min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
    >
      <LevelsToolbarSearchInput value={search} onChange={onSearchChange} />

      <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LevelsBubbleMapFilters
          filter={bubbleMapFilter}
          onFilterChange={onBubbleMapFilterChange}
          counts={bubbleFilterCounts}
        />
      </div>

      <LevelsSlideshowCta
        label={viewToggle.label}
        shortLabel={viewToggle.shortLabel}
        onClick={viewToggle.onClick}
        title={viewToggle.title}
      />
    </div>
  );
}
