"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import {
  filterLevelsSymbolCatalog,
  type LevelsSymbolEntry,
} from "@/lib/levels/levels-symbol-catalog";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export function LevelsSymbolNavigateSearch({
  currentScope,
  currentSymbol,
  openInNewTab = false,
}: {
  currentScope?: LevelsTvScope;
  currentSymbol?: string;
  /** Open chart in a new tab instead of navigating in-place. */
  openInNewTab?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => filterLevelsSymbolCatalog(query, 10), [query]);

  const navigate = useCallback(
    (entry: LevelsSymbolEntry) => {
      setQuery("");
      setOpen(false);
      setActiveIndex(0);
      const url = levelsChartPagePathForHost(
        window.location.hostname,
        entry.scope,
        entry.symbol,
      );
      if (
        !openInNewTab &&
        currentScope &&
        currentSymbol &&
        entry.scope === currentScope &&
        entry.symbol.toUpperCase() === currentSymbol.toUpperCase()
      ) {
        return;
      }
      if (openInNewTab) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(url);
    },
    [currentScope, currentSymbol, openInNewTab, router],
  );

  const pickActive = useCallback(() => {
    const hit = matches[activeIndex] ?? matches[0];
    if (hit) navigate(hit);
  }, [activeIndex, matches, navigate]);

  return (
    <div className="relative shrink-0">
      <LevelsToolbarSearchInput
        inputRef={inputRef}
        value={query}
        onChange={(next) => {
          setQuery(next);
          setOpen(next.trim().length > 0);
          setActiveIndex(0);
        }}
        placeholder="Search symbol…"
        ariaLabel="Search index or F&O symbol"
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || matches.length === 0) {
            if (e.key === "Enter") pickActive();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            pickActive();
          }
        }}
      />

      {open && matches.length > 0 ? (
        <ul
          className="absolute right-0 top-[calc(100%+4px)] z-50 w-[min(18rem,calc(100vw-1.5rem))] max-h-56 overflow-y-auto rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: "rgba(12, 16, 26, 0.98)",
            border: "1px solid rgba(226, 232, 240, 0.18)",
          }}
          role="listbox"
        >
          {matches.map((entry, i) => {
            const active = i === activeIndex;
            return (
              <li key={`${entry.scope}-${entry.symbol}`} role="option" aria-selected={active}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: active ? "rgba(30, 38, 56, 0.95)" : "transparent",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => navigate(entry)}
                >
                  <div
                    className="text-[10px] font-black tracking-tight truncate"
                    style={{ color: "#f8fafc" }}
                  >
                    {entry.symbol}
                  </div>
                  <div
                    className="text-[9px] font-medium truncate"
                    style={{ color: "#94a3b8" }}
                  >
                    {entry.label}
                    {entry.scope === "index" ? " · Index" : ""}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
