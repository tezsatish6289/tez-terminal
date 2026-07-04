"use client";

import { useEffect } from "react";
import { openTradingViewChart } from "@/lib/levels/open-tradingview-chart";

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

/** Global T → open TradingView (works on every chart tab: Chart / Outlook / History / PVT). */
export function useTradingViewChartShortcut(webChartUrl: string, enabled = true): void {
  useEffect(() => {
    if (!enabled || !webChartUrl.trim()) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "t" && e.key !== "T") return;
      e.preventDefault();
      openTradingViewChart(webChartUrl);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [webChartUrl, enabled]);
}
