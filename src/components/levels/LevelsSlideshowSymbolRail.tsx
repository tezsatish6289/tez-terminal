"use client";

import type { ReactNode } from "react";
import { FNO_BG_CANVAS } from "@/lib/fnoninja/theme";
import { LEVELS_SYMBOL_STRIP_TIMER_ROW_HEIGHT_CLASS } from "@/components/levels/levels-symbol-strip";

export function LevelsSlideshowSymbolRailMobile({
  controls,
  symbolList,
  tourAttrs,
}: {
  controls: ReactNode;
  symbolList: ReactNode;
  tourAttrs?: Record<string, string>;
}) {
  return (
    <div
      className="md:hidden shrink-0 min-w-0 flex flex-col gap-1.5 mb-1.5"
      {...tourAttrs}
    >
      {controls}
      <div className={`min-w-0 ${LEVELS_SYMBOL_STRIP_TIMER_ROW_HEIGHT_CLASS}`}>{symbolList}</div>
    </div>
  );
}

export function LevelsSlideshowSymbolRailDesktop({
  controls,
  symbolList,
  tourAttrs,
}: {
  controls: ReactNode;
  symbolList: ReactNode;
  tourAttrs?: Record<string, string>;
}) {
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 self-stretch w-[min(13.5rem,20vw)] max-w-[15rem] min-h-0 border-r border-white/[0.06]"
      style={{ backgroundColor: FNO_BG_CANVAS }}
      {...tourAttrs}
    >
      <div className="shrink-0 flex flex-col gap-1 p-1.5 border-b border-white/[0.06]">
        {controls}
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden p-1.5 pt-1">{symbolList}</div>
    </aside>
  );
}

/** @deprecated Use LevelsSlideshowSymbolRailMobile + LevelsSlideshowSymbolRailDesktop */
export function LevelsSlideshowSymbolRail({
  mobile,
  desktop,
  tourAttrs,
}: {
  mobile: { controls: ReactNode; symbolList: ReactNode };
  desktop: { controls: ReactNode; symbolList: ReactNode };
  tourAttrs?: Record<string, string>;
}) {
  return (
    <>
      <LevelsSlideshowSymbolRailMobile
        controls={mobile.controls}
        symbolList={mobile.symbolList}
        tourAttrs={tourAttrs}
      />
      <LevelsSlideshowSymbolRailDesktop
        controls={desktop.controls}
        symbolList={desktop.symbolList}
        tourAttrs={tourAttrs}
      />
    </>
  );
}
