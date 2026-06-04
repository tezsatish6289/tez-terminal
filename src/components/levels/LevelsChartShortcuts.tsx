"use client";

import { useCallback, useEffect, useState } from "react";

const ROW_GAP = 6;
const ROW_HEIGHT = 52;
const PAUSED_PINK = "#f472b6";
const PAUSED_PINK_MUTED = "rgba(244, 114, 182, 0.92)";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function HintRow({
  topPx,
  bottomPx,
  title,
  titleMuted,
  kbd,
  kbdHint,
  onClick,
  ariaLabel,
  titleColor,
  helperColor,
  kbdColor,
}: {
  topPx?: number;
  bottomPx?: number;
  title: string;
  titleMuted?: string;
  kbd: string;
  kbdHint: string;
  onClick: () => void;
  ariaLabel: string;
  titleColor?: string;
  helperColor?: string;
  kbdColor?: string;
}) {
  const anchored = topPx != null && Number.isFinite(topPx);
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-3 z-20 max-w-[min(100%,300px)] text-left rounded-md px-2.5 py-2 transition-opacity hover:opacity-100 pointer-events-auto"
      style={{
        top: anchored ? topPx : undefined,
        bottom: anchored ? undefined : bottomPx,
        opacity: 0.78,
        backgroundColor: "rgba(6, 9, 18, 0.55)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(4px)",
      }}
      aria-label={ariaLabel}
    >
      <span
        className="block font-semibold leading-snug"
        style={{ fontSize: 14, color: titleColor ?? "rgba(241, 245, 249, 0.95)" }}
      >
        {title}
        {titleMuted ? (
          <span className="font-normal" style={{ color: titleMuted }}>
            {" "}
            {titleMuted}
          </span>
        ) : null}
      </span>
      <span
        className="block mt-0.5 font-medium"
        style={{ fontSize: 12, color: helperColor ?? "rgba(148, 163, 184, 0.9)" }}
      >
        {kbdHint}{" "}
        <kbd className="font-bold" style={{ color: kbdColor ?? "#e2e8f0" }}>
          {kbd}
        </kbd>{" "}
        or click here
      </span>
    </button>
  );
}

/**
 * Chart shortcut hints overlaid on the chart (chart tab / non-slideshow).
 * T → TradingView; 3 → 30-day history zoom (native); P → pause/play slideshow.
 */
export function LevelsChartShortcuts({
  webChartUrl,
  resolveTopPx,
  showSqueeze,
  squeezed,
  onSqueeze,
  showSlideshowControl,
  slideshowPaused,
  onToggleSlideshowPause,
}: {
  webChartUrl: string;
  resolveTopPx?: () => number | null;
  showSqueeze?: boolean;
  squeezed?: boolean;
  onSqueeze?: () => void;
  showSlideshowControl?: boolean;
  slideshowPaused?: boolean;
  onToggleSlideshowPause?: () => void;
}) {
  const [anchorTopPx, setAnchorTopPx] = useState<number | null>(null);

  const syncPosition = useCallback(() => {
    if (!resolveTopPx) {
      setAnchorTopPx(null);
      return;
    }
    setAnchorTopPx(resolveTopPx());
  }, [resolveTopPx]);

  useEffect(() => {
    syncPosition();
    const id = window.setInterval(syncPosition, 400);
    return () => window.clearInterval(id);
  }, [syncPosition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if ((e.key === "t" || e.key === "T") && webChartUrl) {
        e.preventDefault();
        window.open(webChartUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (e.key === "3" && showSqueeze && onSqueeze) {
        e.preventDefault();
        onSqueeze();
        return;
      }
      if ((e.key === "p" || e.key === "P") && showSlideshowControl && onToggleSlideshowPause) {
        e.preventDefault();
        onToggleSlideshowPause();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [webChartUrl, showSqueeze, onSqueeze, showSlideshowControl, onToggleSlideshowPause]);

  const anchored = anchorTopPx != null && Number.isFinite(anchorTopPx);
  const rows: {
    key: string;
    title: string;
    titleMuted?: string;
    kbd: string;
    kbdHint: string;
    onClick: () => void;
    ariaLabel: string;
    titleColor?: string;
    helperColor?: string;
    kbdColor?: string;
  }[] = [];

  rows.push({
    key: "tv",
    title: "Open on TradingView",
    titleMuted: "— new tab",
    kbd: "T",
    kbdHint: "Press",
    onClick: () => window.open(webChartUrl, "_blank", "noopener,noreferrer"),
    ariaLabel: "Open this chart on TradingView in a new tab. Press T or click.",
  });

  if (showSqueeze && onSqueeze) {
    rows.push({
      key: "squeeze",
      title: squeezed ? "Focus recent bars" : "Fit 30 day history",
      kbd: "3",
      kbdHint: "Press",
      onClick: onSqueeze,
      ariaLabel: squeezed
        ? "Zoom chart to recent sessions. Press 3 or click."
        : "Show all loaded 30-day candle history on the chart. Press 3 or click.",
    });
  }

  if (showSlideshowControl && onToggleSlideshowPause) {
    const paused = Boolean(slideshowPaused);
    rows.push({
      key: "pause",
      title: paused ? "Play slideshow" : "Pause slideshow",
      kbd: "P",
      kbdHint: "Press",
      onClick: onToggleSlideshowPause,
      ariaLabel: paused
        ? "Resume auto-advancing symbols every 60 seconds. Press P or click."
        : "Stop auto-advancing symbols. Press P or click.",
      titleColor: paused ? PAUSED_PINK : undefined,
      helperColor: paused ? PAUSED_PINK_MUTED : undefined,
      kbdColor: paused ? PAUSED_PINK : undefined,
    });
  }

  let bottomStack = 14;
  return (
    <>
      {rows.map((row, i) => {
        const topPx = anchored ? anchorTopPx! + i * (ROW_HEIGHT + ROW_GAP) : undefined;
        const bottomPx = anchored ? undefined : bottomStack;
        if (!anchored) bottomStack += ROW_HEIGHT + ROW_GAP;
        return (
          <HintRow
            key={row.key}
            topPx={topPx}
            bottomPx={bottomPx}
            title={row.title}
            titleMuted={row.titleMuted}
            kbd={row.kbd}
            kbdHint={row.kbdHint}
            onClick={row.onClick}
            ariaLabel={row.ariaLabel}
            titleColor={row.titleColor}
            helperColor={row.helperColor}
            kbdColor={row.kbdColor}
          />
        );
      })}
    </>
  );
}

/** @deprecated Use LevelsChartShortcuts */
export function LevelsChartTvHint(
  props: Parameters<typeof LevelsChartShortcuts>[0],
) {
  return <LevelsChartShortcuts {...props} />;
}
