"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Chart watermark + keyboard shortcut (T) to open TradingView in a new tab.
 * When resolveTopPx is provided, sits just under the bull invalidation line.
 */
export function LevelsChartTvHint({
  webChartUrl,
  resolveTopPx,
}: {
  webChartUrl: string;
  /** Y offset (px from top of chart pane) for hint placement; null → bottom-left. */
  resolveTopPx?: () => number | null;
}) {
  const [topPx, setTopPx] = useState<number | null>(null);

  const syncPosition = useCallback(() => {
    if (!resolveTopPx) {
      setTopPx(null);
      return;
    }
    setTopPx(resolveTopPx());
  }, [resolveTopPx]);

  useEffect(() => {
    syncPosition();
    const id = window.setInterval(syncPosition, 400);
    return () => window.clearInterval(id);
  }, [syncPosition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "t" && e.key !== "T") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      window.open(webChartUrl, "_blank", "noopener,noreferrer");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [webChartUrl]);

  const anchored = topPx != null && Number.isFinite(topPx);

  return (
    <button
      type="button"
      onClick={() => window.open(webChartUrl, "_blank", "noopener,noreferrer")}
      className="absolute left-3 z-20 max-w-[min(100%,300px)] text-left rounded-md px-2.5 py-2 transition-opacity hover:opacity-100 pointer-events-auto"
      style={{
        top: anchored ? topPx : undefined,
        bottom: anchored ? undefined : 14,
        opacity: 0.78,
        backgroundColor: "rgba(6, 9, 18, 0.55)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(4px)",
      }}
      aria-label="Open this chart on TradingView in a new tab. Press T or click."
      title="Opens TradingView in a new browser tab"
    >
      <span
        className="block font-semibold leading-snug"
        style={{ fontSize: 14, color: "rgba(241, 245, 249, 0.95)" }}
      >
        Open on TradingView
        <span className="font-normal" style={{ color: "rgba(148, 163, 184, 0.95)" }}>
          {" "}
          — new tab
        </span>
      </span>
      <span
        className="block mt-0.5 font-medium"
        style={{ fontSize: 12, color: "rgba(148, 163, 184, 0.9)" }}
      >
        Press <kbd className="font-bold text-slate-200">T</kbd> or click here
      </span>
    </button>
  );
}
