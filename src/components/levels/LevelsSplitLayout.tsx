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
  layout = "vertical",
}: {
  countLabel?: string;
  header?: ReactNode;
  entries: LevelsListEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
  emptyMessage?: string;
  /** Sidebar on desktop; horizontal strip on mobile (responsive = both). */
  layout?: "vertical" | "horizontal" | "responsive";
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
        className={
          layout === "horizontal"
            ? "flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex flex-row gap-1.5 pb-1 pr-0.5 snap-x snap-mandatory [scrollbar-width:thin]"
            : layout === "responsive"
              ? "flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex flex-row gap-1.5 pb-1 pr-0.5 snap-x snap-mandatory [scrollbar-width:thin] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:snap-none lg:pb-0"
              : "flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5"
        }
        style={{ scrollbarGutter: layout === "horizontal" ? undefined : "stable" }}
      >
        {entries.map((entry, i) => {
          const active = i === activeIndex;
          const stripCard =
            layout === "horizontal" || layout === "responsive"
              ? "min-w-[9.5rem] max-w-[11rem] snap-start lg:min-w-0 lg:max-w-none lg:snap-align-none"
              : "";
          return (
            <button
              key={entry.id}
              onClick={() => onSelect(i)}
              className={`flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-all shrink-0 ${stripCard}`}
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
  slideshowPaused,
  footerExtra,
  emptyHint,
  showCarouselArrows = true,
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
  slideshowPaused?: boolean;
  footerExtra?: ReactNode;
  /** Off in the 3-column layout — list is the primary navigator. */
  showCarouselArrows?: boolean;
}) {
  const hasBands = levels != null && (levels.bullLow != null || levels.bearLow != null);

  return (
    <section className="flex flex-col flex-1 min-w-0 min-h-0 h-full lg:pl-1">
      <div className="text-center mb-2 shrink-0">
        <h2 className="text-sm sm:text-base font-black tracking-tight truncate px-2" style={{ color: "#f8fafc" }}>
          {title}
        </h2>
        {spot != null && (
          <p
            className="mt-0.5 text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tight"
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

        {showCarouselArrows && slideCount > 1 && (
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
            {autoAdvanceNote && slideCount > 1 && !slideshowPaused ? " · 8s" : ""}
            {autoAdvanceNote && slideCount > 1 && slideshowPaused ? (
              <span style={{ color: "#f472b6" }}> · slideshow paused</span>
            ) : null}
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

/** Compact footer when the middle levels ladder is hidden (zones drawn on chart). */
export function LevelsChartMetaFooter({
  slideCount,
  activeIndex,
  onGoTo,
  refreshedLabel,
  autoAdvanceNote,
  slideshowPaused,
}: {
  slideCount: number;
  activeIndex: number;
  onGoTo: (index: number) => void;
  refreshedLabel?: string | null;
  autoAdvanceNote?: boolean;
  slideshowPaused?: boolean;
}) {
  if (slideCount <= 1 && !refreshedLabel) return null;
  return (
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
      {refreshedLabel && (
        <p className="text-[10px] leading-snug" style={{ color: "#64748b" }}>
          {refreshedLabel}
          {autoAdvanceNote && slideCount > 1 && !slideshowPaused ? " · 8s" : ""}
          {autoAdvanceNote && slideCount > 1 && slideshowPaused ? (
            <span style={{ color: "#f472b6" }}> · slideshow paused</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

/** List | levels ladder | chart — or list | chart when zones are on the chart. */
export function LevelsTripleColumnShell({
  list,
  levels,
  chart,
  news,
  hideLevelsColumn = false,
  listAboveChart = false,
  chartChrome,
}: {
  list: ReactNode;
  levels: ReactNode;
  chart: ReactNode;
  /** Optional recent-news rail. With listAboveChart chart 70% : news 30% on lg+. */
  news?: ReactNode;
  /** Native chart already draws POC / bull / bear — drop the center ladder. */
  hideLevelsColumn?: boolean;
  /** Slideshow: filters + tickers in one row above; chart 7 : news 3 on lg+. */
  listAboveChart?: boolean;
  /** Stock title + toolbar row directly above the chart (inside chart column). */
  chartChrome?: ReactNode;
}) {
  if (listAboveChart) {
    return (
      <div
        className="flex flex-col lg:flex-row flex-1 min-h-0 gap-2 sm:gap-3 lg:gap-4 items-stretch pt-2 sm:pt-3 overflow-hidden min-w-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className={`flex flex-col min-h-0 min-w-0 w-full ${news ? "lg:flex-[7] lg:min-w-0" : "lg:flex-1"}`}
        >
          {chartChrome ? <div className="shrink-0 mb-1.5 sm:mb-2 min-w-0">{chartChrome}</div> : null}
          <div className="flex flex-col flex-1 min-h-[min(40dvh,360px)] lg:min-h-0 min-w-0">
            {chart}
          </div>
        </div>
        {news && (
          <>
            <ColumnDivider />
            <div className="flex flex-col min-h-[20rem] lg:min-h-0 w-full lg:flex-[3] lg:min-w-0">
              {news}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col lg:flex-row flex-1 min-h-0 gap-2 sm:gap-3 lg:gap-4 items-stretch pt-2 sm:pt-3 overflow-hidden min-w-0"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="order-2 lg:order-none flex flex-col min-h-0 w-full min-w-0 max-h-[min(32dvh,240px)] sm:max-h-[min(36dvh,280px)] lg:max-h-none lg:w-[min(220px,22vw)] lg:shrink-0 lg:max-w-[240px]">
        {list}
      </div>
      <ColumnDivider />
      {!hideLevelsColumn && (
        <>
          <div className="hidden lg:flex flex-col min-h-0 w-full lg:w-[min(300px,28vw)] lg:shrink-0 lg:max-w-[340px]">
            {levels}
          </div>
          <ColumnDivider />
        </>
      )}
      <div className="order-1 lg:order-none flex flex-col flex-1 min-w-0 min-h-[min(46dvh,400px)] sm:min-h-[min(50dvh,460px)] lg:min-h-0 h-full">
        {chart}
      </div>
      {news && (
        <>
          <ColumnDivider />
          <div className="hidden xl:flex flex-col min-h-0 xl:w-[320px] 2xl:w-[360px] xl:shrink-0">
            {news}
          </div>
        </>
      )}
    </div>
  );
}

/** @deprecated Use LevelsTripleColumnShell */
export function LevelsSplitShell({
  list,
  chart,
}: {
  list: ReactNode;
  chart: ReactNode;
}) {
  return (
    <LevelsTripleColumnShell list={list} levels={chart} chart={<div />} />
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
