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

import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";

function ToolbarPill({
  label,
  kbd,
  onClick,
  ariaLabel,
  active,
  activeColor,
}: {
  label: string;
  kbd: string;
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  activeColor?: string;
}) {
  const accent = activeColor ?? "#e2e8f0";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-md text-[9px] font-bold uppercase tracking-wide transition-all shrink-0`}
      style={{
        backgroundColor: active ? "rgba(244, 114, 182, 0.14)" : "rgba(0,0,0,0.35)",
        color: active ? accent : "#94a3b8",
        border: `1px solid ${active ? "rgba(244, 114, 182, 0.45)" : "rgba(255,255,255,0.08)"}`,
      }}
      aria-label={ariaLabel}
    >
      <span>{label}</span>
      <span style={{ color: active ? accent : "#64748b", fontWeight: 800 }}>· {kbd}</span>
    </button>
  );
}

/**
 * Chart shortcuts: toolbar row on slideshow page, or overlay on chart when layout=overlay.
 * T → TradingView; 3 → 30-day history zoom (native); P → pause/play slideshow.
 */
export function LevelsChartShortcuts({
  layout = "overlay",
  webChartUrl,
  resolveTopPx,
  showSqueeze,
  squeezed,
  onSqueeze,
  showSlideshowControl,
  slideshowPaused,
  onToggleSlideshowPause,
}: {
  layout?: "overlay" | "toolbar";
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
    if (layout !== "overlay" || !resolveTopPx) {
      setAnchorTopPx(null);
      return;
    }
    setAnchorTopPx(resolveTopPx());
  }, [resolveTopPx, layout]);

  useEffect(() => {
    if (layout !== "overlay") return;
    syncPosition();
    const id = window.setInterval(syncPosition, 400);
    return () => window.clearInterval(id);
  }, [syncPosition, layout]);

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
        ? "Resume auto-advancing symbols every 8 seconds. Press P or click."
        : "Stop auto-advancing symbols. Press P or click.",
      titleColor: paused ? PAUSED_PINK : undefined,
      helperColor: paused ? PAUSED_PINK_MUTED : undefined,
      kbdColor: paused ? PAUSED_PINK : undefined,
    });
  }

  if (layout === "toolbar") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <ToolbarPill
          label="TradingView"
          kbd="T"
          onClick={() => window.open(webChartUrl, "_blank", "noopener,noreferrer")}
          ariaLabel="Open this chart on TradingView in a new tab. Press T or click."
        />
        {showSqueeze && onSqueeze ? (
          <ToolbarPill
            label={squeezed ? "Recent bars" : "30 day fit"}
            kbd="3"
            onClick={onSqueeze}
            ariaLabel={
              squeezed
                ? "Zoom chart to recent sessions. Press 3 or click."
                : "Show all loaded 30-day candle history on the chart. Press 3 or click."
            }
          />
        ) : null}
        {showSlideshowControl && onToggleSlideshowPause ? (
          <ToolbarPill
            label={slideshowPaused ? "Play" : "Pause"}
            kbd="P"
            onClick={onToggleSlideshowPause}
            active={Boolean(slideshowPaused)}
            activeColor={PAUSED_PINK}
            ariaLabel={
              slideshowPaused
                ? "Resume auto-advancing symbols every 8 seconds. Press P or click."
                : "Stop auto-advancing symbols. Press P or click."
            }
          />
        ) : null}
      </div>
    );
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
