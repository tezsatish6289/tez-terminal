"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LevelsSymbolNavigateSearch } from "@/components/levels/LevelsSymbolNavigateSearch";

/** Global F&O symbol search — top-right of FNONINJA nav (non-landing pages). */
export function FnoNinjaNavSearch() {
  const [open, setOpen] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      focusRef.current?.querySelector("input")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-colors shrink-0 hover:text-white"
          style={{
            color: open ? "#93c5fd" : "#94a3b8",
            border: `1px solid ${open ? "rgba(96,165,250,0.35)" : "rgba(90,140,220,0.15)"}`,
            backgroundColor: open ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.06)",
          }}
          aria-label="Search index or F&O symbol"
          title="Search symbol"
        >
          <Search className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto p-2 border-0 shadow-lg"
        style={{
          background: "rgba(12, 16, 26, 0.98)",
          border: "1px solid rgba(226, 232, 240, 0.18)",
        }}
      >
        <div ref={focusRef}>
          <LevelsSymbolNavigateSearch openInNewTab />
        </div>
      </PopoverContent>
    </Popover>
  );
}
