"use client";

import { Search } from "lucide-react";
import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import { LevelsSlideshowCta } from "@/components/levels/LevelsSlideshowCta";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
} from "@/lib/levels/cta-blackboard";
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
      <div className="relative shrink-0 w-[10.5rem] sm:w-[12rem] min-w-[9rem]">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
          style={{ color: BLACKBOARD_CHALK_DIM }}
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search…"
          className={`w-full pl-8 pr-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full text-[9px] font-bold uppercase tracking-wide outline-none placeholder:text-slate-500 placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal focus-visible:ring-1 focus-visible:ring-slate-400/30`}
          style={{
            backgroundColor: BLACKBOARD_FIELD_BG,
            border: BLACKBOARD_FIELD_BORDER,
            color: BLACKBOARD_CHALK,
          }}
        />
      </div>

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
