"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LevelsCtaCluster } from "@/components/levels/LevelsCtaCluster";
import { LevelsSlideshowCta } from "@/components/levels/LevelsSlideshowCta";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function LevelsChartPageToolbar({
  webChartUrl,
  nativeChartRef,
  chartFullHistory,
  onBubblesClick,
  bubblesLabel = "Switch to bubbles view",
  bubblesShortLabel = "Bubbles",
  bubblesTitle = "Return to Market Bubbles map. Press S or click.",
  slideshowPause,
}: {
  webChartUrl: string;
  nativeChartRef: React.RefObject<NativeCandlesChartHandle | null>;
  chartFullHistory: boolean;
  /** Slideshow: toggle in-page; chart page: defaults to /freedombot/levels. */
  onBubblesClick?: () => void;
  bubblesLabel?: string;
  bubblesShortLabel?: string;
  bubblesTitle?: string;
  slideshowPause?: {
    enabled: boolean;
    paused: boolean;
    onToggle: () => void;
  };
}) {
  const router = useRouter();

  const goToBubbles = useCallback(() => {
    if (onBubblesClick) {
      onBubblesClick();
      return;
    }
    router.push("/freedombot/levels");
  }, [onBubblesClick, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        goToBubbles();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToBubbles]);

  const actions = useMemo(() => {
    const out: Parameters<typeof LevelsCtaCluster>[0]["actions"] = [
      {
        id: "tv",
        label: "TradingView",
        kbd: "T",
        onClick: () => window.open(webChartUrl, "_blank", "noopener,noreferrer"),
        tone: "default-muted" as const,
        ariaLabel: "Open this chart on TradingView in a new tab. Press T or click.",
      },
      {
        id: "squeeze",
        label: chartFullHistory ? "Recent bars" : "30 day fit",
        kbd: "3",
        onClick: () => nativeChartRef.current?.toggleHistoryZoom(),
        tone: "default-muted" as const,
        ariaLabel: chartFullHistory
          ? "Zoom chart to recent sessions. Press 3 or click."
          : "Show all loaded 30-day candle history on the chart. Press 3 or click.",
      },
    ];
    if (slideshowPause?.enabled) {
      const paused = slideshowPause.paused;
      out.push({
        id: "pause",
        label: paused ? "Play" : "Pause",
        kbd: "P",
        onClick: slideshowPause.onToggle,
        tone: paused ? "paused" : "default-muted",
        ariaLabel: paused
          ? "Resume auto-advancing symbols every 8 seconds. Press P or click."
          : "Stop auto-advancing symbols. Press P or click.",
      });
    }
    return out;
  }, [webChartUrl, chartFullHistory, nativeChartRef, slideshowPause]);

  return (
    <div className="shrink-0 w-full sm:w-auto flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2 min-w-0">
      <LevelsCtaCluster
        actions={actions}
        align="end"
        enableChartKeys
        chartKeys={{
          webChartUrl,
          showSqueeze: true,
          onSqueeze: () => nativeChartRef.current?.toggleHistoryZoom(),
          showSlideshowControl: slideshowPause?.enabled,
          onToggleSlideshowPause: slideshowPause?.onToggle,
        }}
      />
      <LevelsSlideshowCta
        label={bubblesLabel}
        shortLabel={bubblesShortLabel}
        onClick={goToBubbles}
        title={bubblesTitle}
      />
    </div>
  );
}
