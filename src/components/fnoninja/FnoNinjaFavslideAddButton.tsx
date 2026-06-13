"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LevelsToolbarSearchInput } from "@/components/levels/LevelsToolbarSearchInput";
import {
  LEVELS_STRIP_BOX_LABEL_CLASS,
  LEVELS_STRIP_ICON_BOX_CLASS,
  LEVELS_STRIP_ICON_INNER_CLASS,
} from "@/components/levels/levels-symbol-strip";
import { BLACKBOARD_FIELD_BORDER } from "@/lib/levels/cta-blackboard";
import {
  filterLevelsSymbolCatalog,
  type LevelsSymbolEntry,
} from "@/lib/levels/levels-symbol-catalog";
import type { FnoNinjaFavslideApi } from "@/hooks/useFnoNinjaFavslide";
import { FNO_FAVSLIDE_ACCENT } from "@/lib/fnoninja/theme";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export function FnoNinjaFavslideAddButton({
  api,
  onAdded,
  needsSignIn = false,
}: {
  api: FnoNinjaFavslideApi;
  onAdded?: (entry: { scope: LevelsTvScope; symbol: string }) => void;
  needsSignIn?: boolean;
}) {
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
          className={`${LEVELS_STRIP_ICON_BOX_CLASS} ${LEVELS_STRIP_ICON_INNER_CLASS} transition-colors hover:border-amber-400/40 active:scale-[0.98]`}
          style={{
            background: open ? "rgba(251,191,36,0.14)" : "rgba(251,191,36,0.08)",
            border: `1px solid ${open ? "rgba(251,191,36,0.55)" : "rgba(251,191,36,0.35)"}`,
            boxShadow: "none",
          }}
          aria-label={needsSignIn ? "Sign in to add to favslide" : "Add symbol to favslide"}
          title={needsSignIn ? "Sign in to add to favslide" : "Search and add to favslide"}
          data-favslide-tour="add"
        >
          <Plus className="h-5 w-5" style={{ color: FNO_FAVSLIDE_ACCENT }} strokeWidth={2.5} />
          <span
            className={`${LEVELS_STRIP_BOX_LABEL_CLASS} uppercase`}
            style={{ color: FNO_FAVSLIDE_ACCENT }}
          >
            Add
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
            Add to favslide
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
              Sign in to save symbols to your personal favslide list.
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
