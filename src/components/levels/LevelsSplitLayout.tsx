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
    <div className="text-center mb-8 sm:mb-10 shrink-0 px-2">
      <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed" style={{ color: "#64748b" }}>
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
      <p className="text-sm text-center py-12 px-4" style={{ color: "#64748b" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <aside className="flex flex-col min-h-0 w-full lg:w-[280px] lg:shrink-0">
      {header}
      {countLabel && (
        <p
          className="text-[9px] font-black uppercase tracking-[0.14em] mb-4 shrink-0 px-1"
          style={{ color: "#64748b" }}
        >
          {countLabel}
        </p>
      )}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-[140px] lg:min-h-0 lg:max-h-[min(68vh,600px)] pr-1"
        style={{ scrollbarGutter: "stable" }}
      >
        {entries.map((entry, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={entry.id}
              onClick={() => onSelect(i)}
              className="flex flex-col gap-2 px-4 py-3.5 rounded-xl text-left transition-all"
              style={{
                backgroundColor: active ? "rgba(37,99,235,0.18)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.05)"}`,
                boxShadow: active ? "0 0 24px rgba(59,130,246,0.08)" : "none",
              }}
            >
              {(entry.sublabel || entry.trailing) && (
                <div className="flex items-start justify-between gap-3 w-full">
                  {entry.sublabel ? (
                    <span
                      className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0"
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
              <span className="text-sm font-bold leading-snug" style={{ color: "#e2e8f0" }}>
                {entry.label}
              </span>
              {entry.spot != null && entry.currency && (
                <span className="text-xs font-mono tabular-nums" style={{ color: "#94a3b8" }}>
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
}: {
  title: string;
  spot: number | null;
  currency: "₹" | "$";
  levels: PublicLevels | null;
  loading?: boolean;
  unavailable?: boolean;
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
    <section className="flex flex-col flex-1 min-w-0 min-h-[360px] lg:min-h-0 lg:pl-2">
      <div className="text-center mb-5 sm:mb-6 shrink-0">
        <h2 className="text-base sm:text-xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
          {title}
        </h2>
        {spot != null && (
          <p
            className="mt-2 text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight"
            style={{ color: "#fcd34d", textShadow: "0 0 20px rgba(251,191,36,0.3)" }}
          >
            {formatHeroPrice(spot, currency)}
          </p>
        )}
      </div>

      <div className="relative flex-1 flex flex-col justify-center min-h-0 px-2 sm:px-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : hasBands && levels ? (
          <ZonePriceLadder levels={levels} spot={spot} currencySymbol={currency} />
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3 px-6">
            <p className="text-sm" style={{ color: "#64748b" }}>
              {unavailable ? "Levels temporarily unavailable" : "Awaiting level data"}
            </p>
            <p className="text-xs max-w-xs leading-relaxed" style={{ color: "#475569" }}>
              {unavailable
                ? "Last-good levels will return on the next refresh."
                : "Levels populate during the next compute cycle."}
            </p>
          </div>
        )}

        {slideCount > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous"
              className="absolute top-1/2 -translate-y-1/2 left-0 sm:left-2 flex items-center justify-center h-9 w-9 rounded-full transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(0,0,0,0.55)",
                color: "#94a3b8",
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="absolute top-1/2 -translate-y-1/2 right-0 sm:right-2 flex items-center justify-center h-9 w-9 rounded-full transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(0,0,0,0.55)",
                color: "#94a3b8",
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <div className="mt-6 sm:mt-8 shrink-0 text-center space-y-3 pb-2">
        {slideCount > 1 && (
          <div className="flex items-center justify-center gap-2.5">
            {Array.from({ length: slideCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onGoTo(i)}
                aria-label={`Slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === activeIndex ? 28 : 8,
                  backgroundColor: i === activeIndex ? "#3b82f6" : "rgba(255,255,255,0.12)",
                }}
              />
            ))}
          </div>
        )}
        {footerExtra}
        {(refreshedLabel || autoAdvanceNote) && (
          <p className="text-[11px] leading-relaxed" style={{ color: "#64748b" }}>
            {refreshedLabel ?? "Awaiting refresh"}
            {autoAdvanceNote && slideCount > 1 ? " · Auto-advances every 8s" : ""}
          </p>
        )}
      </div>
    </section>
  );
}

/** Two-column shell used on every tab — list left, chart right. */
export function LevelsSplitShell({
  list,
  chart,
}: {
  list: ReactNode;
  chart: ReactNode;
}) {
  return (
    <div
      className="flex flex-col lg:flex-row flex-1 min-h-0 gap-10 lg:gap-14 lg:items-stretch pt-6 sm:pt-8"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      {list}
      <div
        className="hidden lg:block w-px shrink-0 self-stretch"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        aria-hidden
      />
      {chart}
    </div>
  );
}

export function LevelsDisclaimer({ scheduleNote }: { scheduleNote?: string }) {
  return (
    <p className="text-[10px] text-center mt-8 sm:mt-10 shrink-0 leading-relaxed" style={{ color: "#334155" }}>
      {scheduleNote ? `${scheduleNote} · ` : ""}
      For informational purposes only; not investment advice.
    </p>
  );
}
