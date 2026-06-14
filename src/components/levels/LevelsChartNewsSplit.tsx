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
        className={`flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden ${className}`.trim()}
      >
        {chartHeader ? <div className="shrink-0 mb-1.5 sm:mb-2 min-w-0">{chartHeader}</div> : null}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">{chart}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col md:flex-row max-md:flex-none w-full gap-2 md:gap-3 lg:gap-4 md:flex-1 md:min-h-0 md:overflow-hidden ${className}`.trim()}
    >
      {/* Chart — mobile: tall block (scroll page for news); md+: left 60% */}
      <div className="flex flex-col min-w-0 w-full shrink-0 min-h-[min(58dvh,560px)] md:min-h-0 md:h-full md:w-[60%] md:overflow-hidden">
        {chartHeader ? <div className="shrink-0 mb-1.5 sm:mb-2 min-w-0">{chartHeader}</div> : null}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">{chart}</div>
      </div>

      {/* News — mobile: below chart (reachable via scroll); md+: right 40% */}
      <div className="flex flex-col min-w-0 w-full shrink-0 min-h-[min(42dvh,380px)] md:min-h-0 md:flex-none md:h-full md:w-[40%] md:overflow-hidden md:border-l md:border-white/[0.06]">
        {news}
      </div>
    </div>
  );
}
