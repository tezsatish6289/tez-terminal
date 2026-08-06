"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, List } from "lucide-react";
import {
  LevelsSymbolList,
  type LevelsListEntry,
  type LevelsStripAccent,
} from "@/components/levels/LevelsSplitLayout";
import { SlideshowChipTimer } from "@/components/levels/SlideshowChipTimer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FNO_BG_CANVAS, FNO_MUTED } from "@/lib/fnoninja/theme";

/**
 * Phone Livelist / Watchlist chrome — replaces the tall horizontal card strip.
 * Compact control row + current symbol opener; full list lives in a bottom sheet.
 */
export function LevelsSlideshowMobileChrome({
  entries,
  activeIndex,
  onSelect,
  stripAccent = "liveslide",
  filterSlot,
  autoplaySlot,
  timer,
  tourAttrs,
}: {
  entries: LevelsListEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
  stripAccent?: LevelsStripAccent;
  /** Compact filter / Add control(s). */
  filterSlot: ReactNode;
  autoplaySlot?: ReactNode;
  timer?: {
    enabled: boolean;
    paused: boolean;
    secondsRemaining: number;
    pauseReason?: string | null;
    canResume?: boolean;
    onToggle: () => void;
  };
  tourAttrs?: Record<string, string>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const active = entries[activeIndex] ?? entries[0];
  const count = entries.length;
  const position = count > 0 ? `${Math.min(activeIndex + 1, count)} / ${count}` : "0 / 0";
  const timerAccent = stripAccent === "favslide" ? "#fbbf24" : "#60a5fa";

  return (
    <div
      className="md:hidden shrink-0 min-w-0 flex flex-col gap-1.5 mb-1.5"
      {...tourAttrs}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="shrink-0 flex items-center gap-1.5">{filterSlot}</div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          {autoplaySlot ? <div className="min-w-0 shrink">{autoplaySlot}</div> : null}
          {timer?.enabled ? (
            <SlideshowChipTimer
              variant="inline"
              paused={timer.paused}
              secondsRemaining={timer.secondsRemaining}
              pauseReason={timer.pauseReason}
              canResume={timer.canResume}
              accentColor={timerAccent}
              onToggle={timer.onToggle}
            />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left transition-colors hover:bg-white/[0.04] active:scale-[0.99]"
        style={{
          borderColor:
            stripAccent === "favslide"
              ? "rgba(251,191,36,0.35)"
              : "rgba(96,165,250,0.35)",
          backgroundColor: "rgba(255,255,255,0.03)",
        }}
        aria-label={`Open symbol list — ${active?.label ?? "symbols"}, ${position}`}
      >
        <List
          className="h-4 w-4 shrink-0"
          style={{ color: stripAccent === "favslide" ? "#fbbf24" : "#60a5fa" }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "#f8fafc" }}>
          {active?.label ?? "Symbols"}
        </span>
        {active?.trailing ? (
          <span className="shrink-0 scale-90 origin-right">{active.trailing}</span>
        ) : null}
        <span
          className="shrink-0 text-[11px] font-semibold tabular-nums"
          style={{ color: FNO_MUTED }}
        >
          {position}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: FNO_MUTED }} />
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          overlayClassName="z-[220]"
          className="z-[221] inset-x-0 bottom-0 h-[min(72dvh,560px)] max-h-[72dvh] w-full rounded-t-2xl border-t border-white/10 p-0 !gap-0"
          style={{ backgroundColor: FNO_BG_CANVAS }}
        >
          <div className="flex h-full flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <SheetTitle className="shrink-0 px-0.5 pb-2 text-sm font-bold" style={{ color: "#e2e8f0" }}>
              {stripAccent === "favslide" ? "Watchlist" : "Livelist"} · {count}
            </SheetTitle>
            <div className="min-h-0 flex-1 overflow-hidden">
              <LevelsSymbolList
                entries={entries}
                activeIndex={activeIndex}
                onSelect={(i) => {
                  onSelect(i);
                  setSheetOpen(false);
                }}
                layout="vertical"
                runnerMode
                stripAccent={stripAccent}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
