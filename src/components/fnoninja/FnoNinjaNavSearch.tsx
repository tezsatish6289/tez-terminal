"use client";

import { LevelsSymbolNavigateSearch } from "@/components/levels/LevelsSymbolNavigateSearch";

/** Global F&O symbol search — expanded pill in the top nav. */
export function FnoNinjaNavSearch() {
  return (
    <div className="w-full min-w-0 max-w-[22rem] sm:max-w-[26rem]">
      <LevelsSymbolNavigateSearch openInNewTab layout="bar" />
    </div>
  );
}
