"use client";

import type { ReactNode } from "react";

/** Shared deep-dive chart body — symbol chrome, view toggle, left toolbar, chart pane. */
export function LevelsChartDeepDiveLayout({
  chrome,
  viewToggle,
  toolbar,
  symbolRail,
  symbolRailDesktop,
  banner,
  footer,
  children,
  className = "",
}: {
  chrome?: ReactNode;
  viewToggle: ReactNode;
  toolbar: ReactNode;
  /** Slideshow: horizontal strip above chart row on mobile. */
  symbolRail?: ReactNode;
  /** Slideshow: vertical symbol rail left of toolbar on md+. */
  symbolRailDesktop?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const chartPane = (
    <>
      <div className="flex flex-1 min-h-0 min-w-0 mt-1">
        {toolbar}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">{children}</div>
      </div>
      {footer ? <div className="shrink-0 min-w-0 mt-1 max-md:pb-1">{footer}</div> : null}
    </>
  );

  /** Slideshow: full-height symbol rail; header + tabs align with toolbar left edge. */
  if (symbolRailDesktop) {
    return (
      <div className={`flex flex-col flex-1 min-h-0 min-w-0 w-full ${className}`.trim()}>
        {symbolRail}
        <div className="flex flex-1 min-h-0 min-w-0 mt-1.5 sm:mt-2">
          {symbolRailDesktop}
          <div className="flex flex-col flex-1 min-h-0 min-w-0 pl-2 sm:pl-3">
            {chrome ? <div className="shrink-0 min-w-0">{chrome}</div> : null}
            {viewToggle}
            {banner}
            {chartPane}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 min-h-0 min-w-0 w-full ${className}`.trim()}>
      {chrome ? <div className="shrink-0 min-w-0">{chrome}</div> : null}
      <div className="mt-1.5 sm:mt-2 flex flex-col flex-1 min-h-0 min-w-0">
        {viewToggle}
        {banner}
        {chartPane}
      </div>
    </div>
  );
}
