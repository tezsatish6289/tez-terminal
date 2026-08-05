"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import {
  filterLevelsSymbolCatalog,
  type LevelsSymbolEntry,
} from "@/lib/levels/levels-symbol-catalog";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { trackCtaClick } from "@/firebase/analytics";

export function LevelsSymbolNavigateSearch({
  currentScope,
  currentSymbol,
  openInNewTab = false,
  layout = "compact",
  placeholder = "Search symbol…",
  ariaLabel = "Search index or F&O symbol",
  autoFocus = false,
  onNavigate,
  onRequestClose,
}: {
  currentScope?: LevelsTvScope;
  currentSymbol?: string;
  /** Open chart in a new tab instead of navigating in-place. */
  openInNewTab?: boolean;
  layout?: "compact" | "bar" | "sheet";
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Fired after a symbol is chosen (e.g. close mobile sheet). */
  onNavigate?: (entry: LevelsSymbolEntry) => void;
  /** Escape / explicit close from sheet layout. */
  onRequestClose?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const isSheet = layout === "sheet";
  const matches = useMemo(
    () => filterLevelsSymbolCatalog(query, isSheet ? 20 : 10),
    [query, isSheet],
  );
  const showList = isSheet || (open && query.trim().length > 0);

  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  const navigate = useCallback(
    (entry: LevelsSymbolEntry) => {
      trackCtaClick("symbol_search_select", {
        label: entry.label,
        symbol: entry.symbol,
        scope: entry.scope,
      });
      setQuery("");
      setOpen(false);
      setActiveIndex(0);
      onNavigate?.(entry);
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
    [currentScope, currentSymbol, onNavigate, openInNewTab, router],
  );

  const pickActive = useCallback(() => {
    const hit = matches[activeIndex] ?? matches[0];
    if (hit) navigate(hit);
  }, [activeIndex, matches, navigate]);

  const resultList = showList ? (
    <ul
      className={
        isSheet
          ? "mt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-white/10 py-1"
          : `absolute ${layout === "bar" ? "right-0" : "right-0"} top-[calc(100%+4px)] z-50 w-[min(18rem,calc(100vw-1.5rem))] max-h-56 overflow-y-auto rounded-lg py-1 shadow-lg`
      }
      style={{
        backgroundColor: "rgba(12, 16, 26, 0.98)",
        border: isSheet ? undefined : "1px solid rgba(226, 232, 240, 0.18)",
      }}
      role="listbox"
    >
      {query.trim().length === 0 && isSheet ? (
        <li className="px-4 py-6 text-center text-sm" style={{ color: "#64748b" }}>
          Type a symbol or company name
        </li>
      ) : matches.length === 0 ? (
        <li className="px-4 py-6 text-center text-sm" style={{ color: "#64748b" }}>
          No matches for “{query.trim()}”
        </li>
      ) : (
        matches.map((entry, i) => {
          const active = i === activeIndex;
          return (
            <li key={`${entry.scope}-${entry.symbol}`} role="option" aria-selected={active}>
              <button
                type="button"
                className={`w-full text-left transition-colors ${
                  isSheet ? "px-4 py-3.5 min-h-[3.25rem]" : "px-3 py-2"
                }`}
                style={{
                  backgroundColor: active ? "rgba(30, 38, 56, 0.95)" : "transparent",
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigate(entry)}
              >
                <div
                  className={`font-black tracking-tight truncate ${
                    isSheet ? "text-sm" : "text-[10px]"
                  }`}
                  style={{ color: "#f8fafc" }}
                >
                  {entry.symbol}
                </div>
                <div
                  className={`font-medium truncate ${isSheet ? "text-xs mt-0.5" : "text-[9px]"}`}
                  style={{ color: "#94a3b8" }}
                >
                  {entry.label}
                  {entry.scope === "index" ? " · Index" : ""}
                </div>
              </button>
            </li>
          );
        })
      )}
    </ul>
  ) : null;

  return (
    <div
      className={
        isSheet
          ? "relative flex flex-1 min-h-0 w-full min-w-0 flex-col"
          : "relative shrink-0 w-full min-w-0"
      }
    >
      <LevelsToolbarSearchInput
        inputRef={inputRef}
        value={query}
        onChange={(next) => {
          setQuery(next);
          setOpen(next.trim().length > 0);
          setActiveIndex(0);
        }}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        layout={isSheet ? "sheet" : layout}
        onFocus={() => {
          if (query.trim() || isSheet) setOpen(true);
        }}
        onBlur={() => {
          if (isSheet) return;
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            onRequestClose?.();
            return;
          }
          if (!showList || matches.length === 0) {
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
      {resultList}
    </div>
  );
}
