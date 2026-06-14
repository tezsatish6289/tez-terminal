"use client";

import type { ReactNode } from "react";

/**
 * Chart + news layout — two explicit breakpoints:
 * - Mobile (<768px): stacked, tall chart on top, news below (page scrolls)
 * - Tablet/desktop (768px+): chart left 60%, news right 40%, full viewport height
 */
export function LevelsChartNewsSplit({
  chart,
  news,
  chartHeader,
  className = "",
}: {
  chart: ReactNode;
  news?: ReactNode;
  /** Slideshow: symbol header + toolbar above the chart. */
  chartHeader?: ReactNode;
  className?: string;
}) {
  if (!news) {
    return (
      <div
        className={`flex flex-col flex-1 min-h-0 min-w-0 w-full max-md:overflow-visible md:overflow-hidden ${className}`.trim()}
      >
        {chartHeader ? <div className="shrink-0 mb-1.5 sm:mb-2 min-w-0">{chartHeader}</div> : null}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">{chart}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col md:flex-row max-md:flex-none w-full gap-2 md:gap-3 lg:gap-4 md:flex-1 md:min-h-0 max-md:overflow-visible md:overflow-hidden ${className}`.trim()}
    >
      {/* Chart — mobile: fixed height so canvas fills the area; md+: left 60% */}
      <div className="flex flex-col min-w-0 w-full shrink-0 h-[min(52dvh,500px)] md:h-full md:min-h-0 md:w-[60%] md:overflow-hidden">
        {chartHeader ? <div className="shrink-0 mb-1.5 sm:mb-2 min-w-0">{chartHeader}</div> : null}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full">{chart}</div>
      </div>

      {/* News — mobile: below chart (page scroll); md+: right 40% rail */}
      <div className="flex flex-col min-w-0 w-full shrink-0 min-h-[min(44dvh,400px)] max-md:h-auto md:min-h-0 md:h-full md:w-[40%] md:overflow-hidden md:border-l md:border-white/[0.06]">
        {news}
      </div>
    </div>
  );
}
