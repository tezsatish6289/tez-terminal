"use client";

import { LevelsSymbolNavigateSearch } from "@/components/levels/LevelsSymbolNavigateSearch";

/** Global F&O symbol search — expanded pill in the top nav. */
export function FnoNinjaNavSearch() {
  return (
    <div className="w-full min-w-0 max-w-[15rem] sm:max-w-[17rem]">
      <LevelsSymbolNavigateSearch
        openInNewTab
        layout="bar"
        placeholder="NSE F&O universe…"
        ariaLabel="Search NSE F&O symbols and indices"
      />
    </div>
  );
}
