"use client";

import { useMemo } from "react";
import { LevelsCtaCluster } from "@/components/levels/LevelsCtaCluster";
import type { PocDirectionFilter } from "@/lib/zones/zone-status";

const FILTER_OPTIONS: { key: PocDirectionFilter; label: string }[] = [
  { key: "all", label: "All aligned" },
  { key: "bull", label: "In bull · POC above" },
  { key: "bear", label: "In bear · POC below" },
];

export function LevelsSlideshowToolbar({
  zoneFilter,
  onZoneFilterChange,
  countLabel,
  chartShortcuts,
  viewToggle,
}: {
  zoneFilter: PocDirectionFilter;
  onZoneFilterChange: (filter: PocDirectionFilter) => void;
  countLabel?: string;
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
    onClick: () => void;
    title?: string;
  };
}) {
  const filterActions = useMemo(() => {
    const out: Parameters<typeof LevelsCtaCluster>[0]["actions"] = FILTER_OPTIONS.map(
      ({ key, label }) => {
        const active = zoneFilter === key;
        return {
          id: `filter-${key}`,
          label,
          onClick: () => onZoneFilterChange(key),
          tone: active
            ? key === "bull"
              ? "bull"
              : key === "bear"
                ? "bear"
                : "default"
            : "inactive",
          ariaLabel: `Filter: ${label}`,
        };
      },
    );

    if (countLabel) {
      out.push({
        id: "count",
        label: countLabel,
        static: true,
        tone: "inactive",
      });
    }

    return out;
  }, [zoneFilter, onZoneFilterChange, countLabel]);

  const shortcutActions = useMemo(() => {
    const out: Parameters<typeof LevelsCtaCluster>[0]["actions"] = [];

    if (chartShortcuts?.webChartUrl) {
      out.push({
        id: "tv",
        label: "TradingView",
        kbd: "T",
        onClick: () =>
          window.open(chartShortcuts.webChartUrl, "_blank", "noopener,noreferrer"),
        ariaLabel: "Open this chart on TradingView in a new tab. Press T or click.",
      });
    }

    if (chartShortcuts?.showSqueeze && chartShortcuts.onSqueeze) {
      out.push({
        id: "squeeze",
        label: chartShortcuts.squeezed ? "Recent bars" : "30 day fit",
        kbd: "3",
        onClick: chartShortcuts.onSqueeze,
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
        tone: paused ? "paused" : "default",
        ariaLabel: paused
          ? "Resume auto-advancing symbols every 8 seconds. Press P or click."
          : "Stop auto-advancing symbols. Press P or click.",
      });
    }

    out.push({
      id: "view",
      label: viewToggle.label,
      kbd: "S",
      onClick: viewToggle.onClick,
      title: viewToggle.title,
      ariaLabel: viewToggle.title ?? viewToggle.label,
    });

    return out;
  }, [chartShortcuts, viewToggle]);

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-2 mb-2 px-0.5">
      <LevelsCtaCluster actions={filterActions} align="start" />

      <LevelsCtaCluster
        actions={shortcutActions}
        align="end"
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
    </div>
  );
}
