"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** Slideshow chart: centred footer copy aligned with the TradingView watermark row. */
export function LevelsChartTvFooterHint({
  webChartUrl,
  zonesExpiry,
  rightInsetPx = 0,
}: {
  webChartUrl: string;
  zonesExpiry?: string | null;
  /** Width of the right price axis, so the copy centres over the candles. */
  rightInsetPx?: number;
}) {
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

  const lineOne = zonesExpiry
    ? `Support & Resistance Derived from option chain data expiring on ${zonesExpiry}`
    : "Support & Resistance Derived from option chain data";

  return (
    <button
      type="button"
      onClick={() => window.open(webChartUrl, "_blank", "noopener,noreferrer")}
      className="absolute bottom-[28px] left-0 z-20 hidden md:flex justify-center px-3 pointer-events-auto"
      style={{ right: rightInsetPx }}
      aria-label="Open full chart on TradingView in a new tab. Press T or click."
    >
      <span
        className="max-w-[min(100%,42rem)] text-center transition-colors hover:text-slate-200"
        style={{ color: "rgba(148, 163, 184, 0.92)" }}
      >
        <span className="block text-[11px] sm:text-[12px] font-medium leading-snug">{lineOne}</span>
        <span className="block mt-1 text-[11px] sm:text-[12px] font-medium leading-snug">
          See long-term trend confluence on TradingView — Press{" "}
          <kbd className="font-semibold not-italic" style={{ color: "#e2e8f0" }}>
            T
          </kbd>
        </span>
        <span
          className="block mt-1.5 text-[9px] sm:text-[10px] leading-snug"
          style={{ color: "rgba(100, 116, 139, 0.85)" }}
        >
          This is for informational purposes only. Not financial advice.
        </span>
      </span>
    </button>
  );
}
