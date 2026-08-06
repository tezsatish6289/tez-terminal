"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import {
  LEVELS_STRIP_BOX_LABEL_CLASS,
  LEVELS_STRIP_ICON_BOX_CLASS,
  LEVELS_STRIP_ICON_INNER_CLASS,
  LEVELS_RAIL_CONTROL_BOX_CLASS,
  LEVELS_RAIL_CONTROL_INNER_CLASS,
  LEVELS_RAIL_CONTROL_LABEL_CLASS,
} from "@/components/levels/levels-symbol-strip";
import { BLACKBOARD_FIELD_BG, BLACKBOARD_FIELD_BORDER } from "@/lib/levels/cta-blackboard";
import {
  filterLevelsSymbolCatalog,
  type LevelsSymbolEntry,
} from "@/lib/levels/levels-symbol-catalog";
import type { FnoNinjaFavslideApi } from "@/hooks/useFnoNinjaFavslide";
import { FNO_FAVSLIDE_ACCENT } from "@/lib/fnoninja/theme";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { trackCtaClick } from "@/firebase/analytics";

export function FnoNinjaFavslideAddButton({
  api,
  onAdded,
  needsSignIn = false,
  variant = "strip",
  count,
}: {
  api: FnoNinjaFavslideApi;
  onAdded?: (entry: { scope: LevelsTvScope; symbol: string }) => void;
  needsSignIn?: boolean;
  variant?: "strip" | "rail" | "chip";
  /** Watchlist size — shown beside Add in one box. */
  count?: number;
}) {
  const listLabel = "watchlist";
  const isRail = variant === "rail";
  const isChip = variant === "chip";
  const boxClass = isChip
    ? "h-10 min-w-[2.75rem] px-2.5 shrink-0 rounded-full"
    : isRail
      ? LEVELS_RAIL_CONTROL_BOX_CLASS
      : LEVELS_STRIP_ICON_BOX_CLASS;
  const innerClass = isChip
    ? "inline-flex flex-row items-center justify-center gap-1"
    : isRail
      ? LEVELS_RAIL_CONTROL_INNER_CLASS
      : LEVELS_STRIP_ICON_INNER_CLASS;
  const labelClass = isChip
    ? "text-[10px] font-bold leading-none uppercase tracking-wide whitespace-nowrap"
    : isRail
      ? LEVELS_RAIL_CONTROL_LABEL_CLASS
      : LEVELS_STRIP_BOX_LABEL_CLASS;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => filterLevelsSymbolCatalog(query, 12), [query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setAddingKey(null);
    }
  }, [open]);

  const handleAdd = useCallback(
    async (entry: LevelsSymbolEntry) => {
      if (needsSignIn || api.isFavorite(entry.scope, entry.symbol) || api.mutating) return;
      trackCtaClick("favslide_add", {
        label: entry.label,
        symbol: entry.symbol,
        scope: entry.scope,
      });
      const key = `${entry.scope}:${entry.symbol}`;
      setAddingKey(key);
      try {
        const ok = await api.setFavorite(entry.scope, entry.symbol, true);
        if (ok) onAdded?.({ scope: entry.scope, symbol: entry.symbol });
      } finally {
        setAddingKey(null);
      }
    },
    [api, needsSignIn, onAdded],
  );

  const pickActive = useCallback(() => {
    const hit = matches[activeIndex] ?? matches[0];
    if (hit) void handleAdd(hit);
  }, [activeIndex, handleAdd, matches]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${boxClass} ${innerClass} transition-colors hover:border-white/12 active:scale-[0.98]`}
          style={{
            background: open ? "rgba(251,191,36,0.08)" : BLACKBOARD_FIELD_BG,
            border: open ? "1px solid rgba(251,191,36,0.28)" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: "none",
          }}
          aria-label={
            needsSignIn
              ? `Sign in to add to ${listLabel}`
              : count != null
                ? `Add symbol to ${listLabel}, ${count} saved`
                : `Add symbol to ${listLabel}`
          }
          title={needsSignIn ? `Sign in to add to ${listLabel}` : `Search and add to ${listLabel}`}
          data-favslide-tour={count != null ? "fav-count" : "add"}
        >
          <Plus
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: open ? FNO_FAVSLIDE_ACCENT : "rgba(251,191,36,0.55)" }}
            strokeWidth={2.5}
          />
          <span
            className={`${labelClass} uppercase tabular-nums${count != null ? " truncate" : ""}`}
            style={{ color: open ? FNO_FAVSLIDE_ACCENT : "#94a3b8" }}
          >
            {count != null ? `Add · ${count}` : "Add"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0 border-0 shadow-lg overflow-hidden"
        style={{
          background: "rgba(12, 16, 26, 0.98)",
          border: BLACKBOARD_FIELD_BORDER,
        }}
      >
        <div className="p-2.5 border-b" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
          <p
            className="px-1 pb-2 text-[9px] font-black uppercase tracking-[0.14em]"
            style={{ color: "#64748b" }}
          >
            Add to watchlist
          </p>
          <LevelsToolbarSearchInput
            inputRef={inputRef}
            value={query}
            onChange={(next) => {
              setQuery(next);
              setActiveIndex(0);
            }}
            className="w-full min-w-0"
            placeholder="Search index or F&O symbol…"
            ariaLabel="Search index or F&O symbol to add"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (matches.length === 0) return;
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
        </div>

        <div className="max-h-56 overflow-y-auto py-1">
          {needsSignIn ? (
            <p className="px-3 py-4 text-xs leading-relaxed" style={{ color: "#64748b" }}>
              Sign in to save symbols to your personal watchlist.
            </p>
          ) : query.trim().length === 0 ? (
            <p className="px-3 py-4 text-xs leading-relaxed" style={{ color: "#64748b" }}>
              Type a symbol or company name — results stay on this page.
            </p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-4 text-xs" style={{ color: "#64748b" }}>
              No matching F&amp;O symbols.
            </p>
          ) : (
            matches.map((entry, i) => {
              const key = `${entry.scope}:${entry.symbol}`;
              const favorited = api.isFavorite(entry.scope, entry.symbol);
              const busy = addingKey === key || api.mutating;
              const active = i === activeIndex;

              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-2 py-1"
                  style={{
                    background: active ? "rgba(251,191,36,0.06)" : "transparent",
                  }}
                >
                  <div className="min-w-0 flex-1 px-1">
                    <div
                      className="text-[11px] font-black tracking-tight truncate"
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
                  </div>
        <button
          type="button"
          disabled={busy || needsSignIn}
          onClick={() => void handleAdd(entry)}
          data-favslide-tour="add"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-60"
                    style={{
                      color: favorited ? "#64748b" : FNO_FAVSLIDE_ACCENT,
                      backgroundColor: favorited
                        ? "rgba(30,41,59,0.6)"
                        : "rgba(251,191,36,0.12)",
                      border: `1px solid ${favorited ? "rgba(90,140,220,0.12)" : "rgba(251,191,36,0.35)"}`,
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : favorited ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {favorited ? "Added" : "Add"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
