"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { LevelsSymbolNavigateSearch } from "@/components/levels/LevelsSymbolNavigateSearch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FNO_BG_CANVAS, FNO_MUTED } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";

/** Global F&O symbol search — icon→full sheet on mobile, expanded pill on md+. */
export function FnoNinjaNavSearch() {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <>
      <button
        type="button"
        className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
        style={{ color: "#e2e8f0" }}
        aria-label="Search NSE F&O symbols"
        onClick={() => {
          trackCtaClick("nav_search_open", { label: "Search" });
          setSheetOpen(true);
        }}
      >
        <Search className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <div className="hidden md:block w-full min-w-0 max-w-[17rem]">
        <LevelsSymbolNavigateSearch
          openInNewTab
          layout="bar"
          placeholder="NSE F&O universe…"
          ariaLabel="Search NSE F&O symbols and indices"
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="top"
          overlayClassName="z-[220]"
          className="z-[221] inset-x-0 top-0 h-[100dvh] max-h-[100dvh] w-full border-b border-white/10 p-0 !gap-0 [&>button]:right-3 [&>button]:top-[max(0.75rem,env(safe-area-inset-top))] [&>button]:text-slate-200 [&>button]:opacity-90"
          style={{ backgroundColor: FNO_BG_CANVAS }}
        >
          <div className="flex h-full flex-col px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))]">
            <SheetTitle className="sr-only">Search NSE F&O symbols</SheetTitle>
            <LevelsSymbolNavigateSearch
              layout="sheet"
              openInNewTab={false}
              autoFocus
              placeholder="Search NSE F&O symbols…"
              ariaLabel="Search NSE F&O symbols and indices"
              onNavigate={() => setSheetOpen(false)}
              onRequestClose={() => setSheetOpen(false)}
            />
            <p className="mt-3 shrink-0 text-center text-[11px]" style={{ color: FNO_MUTED }}>
              Tap a symbol to open its chart
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
