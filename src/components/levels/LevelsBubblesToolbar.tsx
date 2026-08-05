"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import {
  LevelsSlideshowCta,
  type LevelsSlideCtaVariant,
} from "@/components/levels/LevelsSlideshowCta";
import { FNO_BG_CANVAS } from "@/lib/fnoninja/theme";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";

/** Matches levels app surface so the scroll fade blends into the page. */
const FILTER_SCROLL_FADE = `linear-gradient(to left, ${FNO_BG_CANVAS} 15%, ${FNO_BG_CANVAS}99 55%, transparent 100%)`;

const FILTER_SCROLL_CLASS =
  "min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Bubble map chrome: zone filters on row 1 (scroll); Watchlist / Livelist on row 2 (mobile).
 * Desktop keeps filters + modes on one row.
 */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollFade, setShowScrollFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 2;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setShowScrollFade(canScroll && !atEnd);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [bubbleMapFilter, bubbleFilterCounts, atlasQuality?.enabled]);

  const showModes = !hideSlideshowCtas;

  const modeCtas = showModes ? (
    <div className="shrink-0 flex items-center gap-1.5 pb-0.5">
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
  ) : null;

  return (
    <div className="shrink-0 mb-2 flex flex-col gap-1.5 min-w-0 px-0.5 md:flex-row md:items-center md:gap-1.5">
      <div className="relative min-w-0 w-full md:flex-1">
        <div ref={scrollRef} className={FILTER_SCROLL_CLASS}>
          <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-none pb-0.5 pr-3">
            <LevelsBubbleMapFilters
              filter={bubbleMapFilter}
              onFilterChange={onBubbleMapFilterChange}
              counts={bubbleFilterCounts}
              maxPainVisibility={maxPainVisibility}
              atlasQuality={atlasQuality}
            />
          </div>
        </div>
        {showScrollFade ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-9 sm:w-11"
            style={{ background: FILTER_SCROLL_FADE }}
          />
        ) : null}
      </div>

      {showModes || shareTrailing ? (
        <div className="flex items-center gap-1.5 min-w-0 md:shrink-0">
          {modeCtas}
          {shareTrailing ? <div className="shrink-0 pb-0.5">{shareTrailing}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
