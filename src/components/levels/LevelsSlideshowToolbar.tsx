"use client";

import { useMemo, type ReactNode } from "react";
import { LevelsBubbleMapFilters } from "@/components/levels/LevelsBubbleMapFilters";
import { LevelsBubblesToolbar } from "@/components/levels/LevelsBubblesToolbar";
import { LevelsCtaCluster } from "@/components/levels/LevelsCtaCluster";
import { LevelsSlideshowStripControls } from "@/components/levels/LevelsSlideshowStripControls";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";
import { LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS } from "@/components/levels/levels-symbol-strip";
import type { PocDirectionFilter } from "@/lib/zones/zone-status";

const FILTER_OPTIONS: {
  key: PocDirectionFilter;
  label: string;
  activeTone: "default" | "bull" | "bear";
  mutedTone: "default-muted" | "bull-muted" | "bear-muted";
}[] = [
  { key: "all", label: "All", activeTone: "default", mutedTone: "default-muted" },
  { key: "bull", label: "At Support", activeTone: "bull", mutedTone: "bull-muted" },
  { key: "bear", label: "At Resistance", activeTone: "bear", mutedTone: "bear-muted" },
  { key: "near_bull", label: "Near Support", activeTone: "bull", mutedTone: "bull-muted" },
  { key: "near_bear", label: "Near Resistance", activeTone: "bear", mutedTone: "bear-muted" },
];

export function LevelsSlideshowToolbar({
  zoneFilter,
  onZoneFilterChange,
  filterCounts,
  chartShortcuts,
  viewToggle,
  filtersOnly = false,
  symbolStrip,
  slideshowControl,
  viewModeToggle,
  bubblesMode = false,
  bubbleMapFilter,
  onBubbleMapFilterChange,
  bubbleFilterCounts,
  bubbleSearch = "",
  onBubbleSearchChange,
}: {
  zoneFilter?: PocDirectionFilter;
  onZoneFilterChange?: (filter: PocDirectionFilter) => void;
  filterCounts?: Record<PocDirectionFilter, number>;
  /** Bubbles map: tone filters instead of All / Bullish / Bearish. */
  bubblesMode?: boolean;
  bubbleMapFilter?: BubbleMapFilter;
  onBubbleMapFilterChange?: (filter: BubbleMapFilter) => void;
  bubbleFilterCounts?: Record<BubbleMapFilter, number>;
  bubbleSearch?: string;
  onBubbleSearchChange?: (value: string) => void;
  chartShortcuts?: {
    webChartUrl: string;
    showSqueeze?: boolean;
    squeezed?: boolean;
    onSqueeze?: () => void;
    showSlideshowControl?: boolean;
    slideshowPaused?: boolean;
    onToggleSlideshowPause?: () => void;
  } | null;
  viewToggle: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
    title?: string;
  };
  /** Slideshow with chart chrome: filters row only (symbol header is separate). */
  filtersOnly?: boolean;
  /** In-zone ticker cards — same row as filters when filtersOnly. */
  symbolStrip?: ReactNode;
  /** Play/pause auto-advance — icon box beside filter (not in chart toolbar). */
  slideshowControl?: {
    enabled: boolean;
    paused: boolean;
    onToggle: () => void;
    secondsRemaining?: number;
  };
  /** Icon box beside play/pause on slideshow strip row. */
  viewModeToggle?: {
    viewMode: "bubbles" | "slideshow";
    onToggle: () => void;
    title?: string;
  };
}) {
  const filterActions = useMemo(
    () =>
      zoneFilter != null && filterCounts != null && onZoneFilterChange
        ? FILTER_OPTIONS.map(({ key, label, activeTone, mutedTone }) => {
            const active = zoneFilter === key;
            return {
              id: `filter-${key}`,
              label,
              count: filterCounts[key],
              onClick: () => onZoneFilterChange(key),
              tone: active ? activeTone : mutedTone,
              ariaLabel: `${label}, ${filterCounts[key]} symbols`,
            };
          })
        : [],
    [zoneFilter, onZoneFilterChange, filterCounts],
  );

  const shortcutActions = useMemo(() => {
    const out: Parameters<typeof LevelsCtaCluster>[0]["actions"] = [];

    if (chartShortcuts?.webChartUrl) {
      out.push({
        id: "tv",
        label: "TradingView",
        kbd: "T",
        onClick: () =>
          window.open(chartShortcuts.webChartUrl, "_blank", "noopener,noreferrer"),
        tone: "default-muted",
        ariaLabel: "Open this chart on TradingView in a new tab. Press T or click.",
      });
    }

    if (chartShortcuts?.showSqueeze && chartShortcuts.onSqueeze) {
      out.push({
        id: "squeeze",
        label: chartShortcuts.squeezed ? "Recent bars" : "30 day fit",
        kbd: "3",
        onClick: chartShortcuts.onSqueeze,
        tone: "default-muted",
        ariaLabel: chartShortcuts.squeezed
          ? "Zoom chart to recent sessions. Press 3 or click."
          : "Show all loaded 30-day candle history on the chart. Press 3 or click.",
      });
    }

    if (chartShortcuts?.showSlideshowControl && chartShortcuts.onToggleSlideshowPause) {
      const paused = Boolean(chartShortcuts.slideshowPaused);
      out.push({
        id: "pause",
        label: paused ? "Play" : "Pause",
        kbd: "P",
        onClick: chartShortcuts.onToggleSlideshowPause,
        tone: paused ? "paused" : "default-muted",
        ariaLabel: paused
          ? "Resume auto-advancing symbols every 60 seconds. Press P or click."
          : "Stop auto-advancing symbols. Press P or click.",
      });
    }

    return out;
  }, [chartShortcuts]);

  if (filtersOnly) {
    return (
      <div className="shrink-0 flex flex-col gap-1.5 mb-1.5 px-0.5 min-w-0">
        {bubbleMapFilter != null &&
        onBubbleMapFilterChange &&
        bubbleFilterCounts ? (
          <div className="w-full min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <LevelsBubbleMapFilters
              filter={bubbleMapFilter}
              onFilterChange={onBubbleMapFilterChange}
              counts={bubbleFilterCounts}
            />
          </div>
        ) : null}
        <div
          className={`flex items-stretch gap-1.5 sm:gap-2 min-w-0 ${LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS}`}
        >
          <LevelsSlideshowStripControls
            zoneFilter={zoneFilter ?? "all"}
            onZoneFilterChange={onZoneFilterChange ?? (() => {})}
            filterCounts={
              filterCounts ?? {
                all: 0,
                bull: 0,
                bear: 0,
                near_bull: 0,
                near_bear: 0,
              }
            }
            showFilter={false}
            slideshowControl={slideshowControl}
            viewToggle={viewModeToggle}
          />
          {symbolStrip ? (
            <div className="flex-1 min-w-0 min-h-0 h-full">{symbolStrip}</div>
          ) : null}
        </div>
      </div>
    );
  }

  if (
    bubblesMode &&
    bubbleFilterCounts &&
    onBubbleMapFilterChange &&
    bubbleMapFilter != null &&
    onBubbleSearchChange
  ) {
    return (
      <LevelsBubblesToolbar
        search={bubbleSearch}
        onSearchChange={onBubbleSearchChange}
        bubbleMapFilter={bubbleMapFilter}
        onBubbleMapFilterChange={onBubbleMapFilterChange}
        bubbleFilterCounts={bubbleFilterCounts}
        viewToggle={viewToggle}
      />
    );
  }

  return (
    <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center mb-2 px-0.5 min-w-0">
      <div className="w-full min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LevelsCtaCluster actions={filterActions} align="start" />
      </div>

      <div className="w-full sm:w-auto sm:ml-auto flex flex-col xs:flex-row flex-wrap items-stretch sm:items-center justify-end gap-1.5 shrink-0 min-w-0">
        {shortcutActions.length > 0 ? (
          <LevelsCtaCluster
            actions={shortcutActions}
            enableChartKeys={Boolean(chartShortcuts)}
            chartKeys={
              chartShortcuts
                ? {
                    webChartUrl: chartShortcuts.webChartUrl,
                    showSqueeze: chartShortcuts.showSqueeze,
                    onSqueeze: chartShortcuts.onSqueeze,
                    showSlideshowControl: chartShortcuts.showSlideshowControl,
                    onToggleSlideshowPause: chartShortcuts.onToggleSlideshowPause,
                  }
                : undefined
            }
          />
        ) : null}
        <LevelsSlideshowStripControls
          zoneFilter={zoneFilter ?? "all"}
          onZoneFilterChange={onZoneFilterChange ?? (() => {})}
          filterCounts={
            filterCounts ?? {
              all: 0,
              bull: 0,
              bear: 0,
              near_bull: 0,
              near_bear: 0,
            }
          }
          showFilter={false}
          viewToggle={{
            viewMode: "bubbles",
            onToggle: viewToggle.onClick,
            title: viewToggle.title,
          }}
        />
      </div>
    </div>
  );
}
