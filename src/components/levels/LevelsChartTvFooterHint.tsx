"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** Slideshow chart: centred footer line aligned with the TradingView watermark row. */
export function LevelsChartTvFooterHint({ webChartUrl }: { webChartUrl: string }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if ((e.key === "t" || e.key === "T") && webChartUrl) {
        e.preventDefault();
        window.open(webChartUrl, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [webChartUrl]);

  return (
    <button
      type="button"
      onClick={() => window.open(webChartUrl, "_blank", "noopener,noreferrer")}
      className="absolute bottom-[10px] left-0 right-0 z-20 flex justify-center px-3 pointer-events-auto"
      aria-label="Open full chart on TradingView in a new tab. Press T or click."
    >
      <span
        className="text-[12px] sm:text-[13px] font-medium text-center transition-colors hover:text-slate-200"
        style={{ color: "rgba(148, 163, 184, 0.92)" }}
      >
        Press{" "}
        <kbd className="font-semibold not-italic" style={{ color: "#e2e8f0" }}>
          T
        </kbd>{" "}
        to see full chart on Tradingview
      </span>
    </button>
  );
}
