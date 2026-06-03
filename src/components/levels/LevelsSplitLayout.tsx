"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ZonePriceLadder, formatHeroPrice, type PublicLevels } from "@/components/levels/ZonePriceLadder";

/** Shared list row for every levels tab (left rail). */
export interface LevelsListEntry {
  id: string;
  label: string;
  sublabel?: string;
  spot?: number | null;
  currency?: "₹" | "$";
  trailing?: ReactNode;
}

export function LevelsPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center mb-3 shrink-0 px-2">
      <h1 className="text-lg sm:text-xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[11px] max-w-md mx-auto leading-snug" style={{ color: "#64748b" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function LevelsSymbolList({
  countLabel,
  header,
  entries,
  activeIndex,
  onSelect,
  emptyMessage = "Nothing to show yet.",
}: {
  countLabel?: string;
  header?: ReactNode;
  entries: LevelsListEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
  emptyMessage?: string;
}) {
  if (!entries.length) {
    return (
      <p className="text-sm text-center py-8 px-4" style={{ color: "#64748b" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <aside className="flex flex-col min-h-0 w-full h-full">
      {header}
      {countLabel && (
        <p
          className="text-[9px] font-black uppercase tracking-[0.14em] mb-2 shrink-0 px-0.5"
          style={{ color: "#64748b" }}
        >
          {countLabel}
        </p>
      )}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5"
        style={{ scrollbarGutter: "stable" }}
      >
        {entries.map((entry, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={entry.id}
              onClick={() => onSelect(i)}
              className="flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-all shrink-0"
              style={{
                backgroundColor: active ? "rgba(37,99,235,0.18)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              {(entry.sublabel || entry.trailing) && (
                <div className="flex items-center justify-between gap-2 w-full">
                  {entry.sublabel ? (
                    <span
                      className="text-[7px] font-black uppercase px-1 py-0.5 rounded shrink-0"
                      style={{ color: "#93c5fd", backgroundColor: "rgba(59,130,246,0.1)" }}
                    >
                      {entry.sublabel}
                    </span>
                  ) : (
                    <span />
                  )}
                  {entry.trailing}
                </div>
              )}
              <span className="text-[13px] font-bold leading-tight truncate" style={{ color: "#e2e8f0" }}>
                {entry.label}
              </span>
              {entry.spot != null && entry.currency && (
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "#94a3b8" }}>
                  {formatHeroPrice(entry.spot, entry.currency)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function LevelsChartPanel({
  title,
  spot,
  currency,
  levels,
  loading,
  unavailable,
  slideCount,
  activeIndex,
  onPrev,
  onNext,
  onGoTo,
  refreshedLabel,
  autoAdvanceNote,
  footerExtra,
  emptyHint,
}: {
  title: string;
  spot: number | null;
  currency: "₹" | "$";
  levels: PublicLevels | null;
  loading?: boolean;
  unavailable?: boolean;
  emptyHint?: string;
  slideCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  refreshedLabel?: string | null;
  autoAdvanceNote?: boolean;
  footerExtra?: ReactNode;
}) {
  const hasBands = levels != null && (levels.bullLow != null || levels.bearLow != null);

  return (
    <section className="flex flex-col flex-1 min-w-0 min-h-0 h-full overflow-hidden">
      <div className="text-center mb-1.5 shrink-0 px-1">
        <h2 className="text-xs font-black tracking-tight truncate" style={{ color: "#f8fafc" }}>
          {title}
        </h2>
        {spot != null && (
          <p
            className="mt-0.5 text-lg font-black font-mono tabular-nums tracking-tight"
            style={{ color: "#fcd34d", textShadow: "0 0 16px rgba(251,191,36,0.25)" }}
          >
            {formatHeroPrice(spot, currency)}
          </p>
        )}
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col justify-center px-0.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
            {emptyHint && (
              <p className="text-[11px] text-center max-w-xs" style={{ color: "#64748b" }}>
                {emptyHint}
              </p>
            )}
          </div>
        ) : hasBands && levels ? (
          <ZonePriceLadder levels={levels} spot={spot} currencySymbol={currency} variant="embedded" />
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-8 gap-2 px-4">
            <p className="text-xs" style={{ color: "#64748b" }}>
              {unavailable ? "Levels temporarily unavailable" : "Awaiting level data"}
            </p>
            {emptyHint && (
              <p className="text-[11px] max-w-xs leading-relaxed" style={{ color: "#475569" }}>
                {emptyHint}
              </p>
            )}
          </div>
        )}

        {slideCount > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous"
              className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(0,0,0,0.55)",
                color: "#94a3b8",
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(0,0,0,0.55)",
                color: "#94a3b8",
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <div className="mt-2 shrink-0 text-center space-y-1.5">
        {slideCount > 1 && (
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: slideCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onGoTo(i)}
                aria-label={`Slide ${i + 1}`}
                className="h-1 rounded-full transition-all"
                style={{
                  width: i === activeIndex ? 22 : 6,
                  backgroundColor: i === activeIndex ? "#3b82f6" : "rgba(255,255,255,0.12)",
                }}
              />
            ))}
          </div>
        )}
        {footerExtra}
        {(refreshedLabel || autoAdvanceNote) && (
          <p className="text-[10px] leading-snug" style={{ color: "#64748b" }}>
            {refreshedLabel ?? "Awaiting refresh"}
            {autoAdvanceNote && slideCount > 1 ? " · 8s" : ""}
          </p>
        )}
      </div>
    </section>
  );
}

function ColumnDivider() {
  return (
    <div
      className="hidden lg:block w-px shrink-0 self-stretch"
      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
      aria-hidden
    />
  );
}

/** List (left) · levels ladder (center, narrow) · TradingView (right, flex). */
export function LevelsTripleShell({
  list,
  levels,
  chart,
}: {
  list: ReactNode;
  levels: ReactNode;
  chart: ReactNode;
}) {
  return (
    <div
      className="flex flex-col lg:flex-row flex-1 min-h-0 gap-3 lg:gap-0 lg:items-stretch pt-3 overflow-hidden"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="flex flex-col min-h-0 w-full lg:w-[200px] xl:w-[220px] shrink-0 max-h-[32vh] lg:max-h-none lg:h-full overflow-hidden">
        {list}
      </div>
      <ColumnDivider />
      <div className="flex flex-col min-h-0 w-full lg:w-[260px] xl:w-[280px] shrink-0 max-h-[40vh] lg:max-h-none lg:h-full overflow-hidden px-1">
        {levels}
      </div>
      <ColumnDivider />
      <div className="flex flex-col flex-1 min-w-0 min-h-[280px] lg:min-h-0 lg:h-full overflow-hidden pl-0 lg:pl-2">
        {chart}
      </div>
    </div>
  );
}

/** @deprecated Use LevelsTripleShell — kept for any external imports. */
export function LevelsSplitShell({
  list,
  chart,
}: {
  list: ReactNode;
  chart: ReactNode;
}) {
  return (
    <LevelsTripleShell
      list={list}
      levels={chart}
      chart={
        <div className="flex flex-1 items-center justify-center text-xs" style={{ color: "#64748b" }}>
          Chart column unavailable
        </div>
      }
    />
  );
}

export function LevelsDisclaimer({ scheduleNote }: { scheduleNote?: string }) {
  return (
    <p className="text-[9px] text-center mt-2 shrink-0 leading-snug" style={{ color: "#334155" }}>
      {scheduleNote ? `${scheduleNote} · ` : ""}
      For informational purposes only; not investment advice.
    </p>
  );
}

/** Sort list entries A–Z by display label. */
export function sortEntriesAlpha(entries: LevelsListEntry[]): LevelsListEntry[] {
  return [...entries].sort((a, b) =>
    a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  );
}
