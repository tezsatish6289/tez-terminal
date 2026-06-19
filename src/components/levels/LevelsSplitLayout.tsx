"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ZonePriceLadder, formatHeroPrice, type PublicLevels } from "@/components/levels/ZonePriceLadder";
import { LEVELS_SYMBOL_STRIP_SCROLL_CLASS } from "@/components/levels/levels-symbol-strip";
import { FNO_BG_CANVAS, FNO_FAVSLIDE_ACCENT } from "@/lib/fnoninja/theme";
import { LevelsChartNewsSplit } from "@/components/levels/LevelsChartNewsSplit";

export type LevelsStripAccent = "liveslide" | "favslide";

const STRIP_ACCENT_STYLE: Record<
  LevelsStripAccent,
  { bg: string; border: string; borderPulse: string; glow: string; glowSoft: string; sublabel: string; sublabelBg: string }
> = {
  liveslide: {
    bg: "rgba(37,99,235,0.18)",
    border: "rgba(59,130,246,0.35)",
    borderPulse: "rgba(96,165,250,0.65)",
    glow: "0 0 20px rgba(59,130,246,0.4), 0 0 40px rgba(59,130,246,0.12)",
    glowSoft: "0 0 10px rgba(59,130,246,0.15)",
    sublabel: "#93c5fd",
    sublabelBg: "rgba(59,130,246,0.1)",
  },
  favslide: {
    bg: "rgba(251,191,36,0.14)",
    border: "rgba(251,191,36,0.32)",
    borderPulse: "rgba(252,211,77,0.62)",
    glow: "0 0 20px rgba(251,191,36,0.35), 0 0 40px rgba(251,191,36,0.1)",
    glowSoft: "0 0 10px rgba(251,191,36,0.14)",
    sublabel: FNO_FAVSLIDE_ACCENT,
    sublabelBg: "rgba(251,191,36,0.12)",
  },
};

/** Map vertical wheel to horizontal scroll on desktop trackpads/mice. */
function useHorizontalWheelScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, ref]);
}

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
  runnerMode = false,
  stripAccent = "liveslide",
}: {
  countLabel?: string;
  header?: ReactNode;
  entries: LevelsListEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
  emptyMessage?: string;
  /** Sidebar on desktop; horizontal strip on mobile (responsive = both). */
  layout?: "vertical" | "horizontal" | "responsive";
  /** Slideshow strip: auto-scroll active tile + edge fade ticker feel. */
  runnerMode?: boolean;
  /** Active tile ring color in horizontal runner strip. */
  stripAccent?: LevelsStripAccent;
}) {
  const accent = STRIP_ACCENT_STYLE[stripAccent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(activeIndex);
  const [runnerPulse, setRunnerPulse] = useState(false);

  const isRunnerStrip = runnerMode && layout === "horizontal";
  useHorizontalWheelScroll(scrollRef, isRunnerStrip);

  useEffect(() => {
    if (!isRunnerStrip) return;

    const container = scrollRef.current;
    const tile = container?.querySelector(
      `[data-strip-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    tile?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    if (prevActiveRef.current !== activeIndex) {
      setRunnerPulse(true);
      prevActiveRef.current = activeIndex;
      const id = window.setTimeout(() => setRunnerPulse(false), 700);
      return () => window.clearTimeout(id);
    }
  }, [activeIndex, isRunnerStrip, entries.length]);

  if (!entries.length) {
    return (
      <p className="text-sm text-center py-8 px-4" style={{ color: "#64748b" }}>
        {emptyMessage}
      </p>
    );
  }

  if (isRunnerStrip) {
    return (
      <div className="relative h-full w-full min-w-0 min-h-0">
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-5 sm:w-8 z-10"
          style={{
            background: `linear-gradient(to right, ${FNO_BG_CANVAS} 0%, ${FNO_BG_CANVAS} 35%, transparent 100%)`,
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-5 sm:w-8 z-10"
          style={{
            background: `linear-gradient(to left, ${FNO_BG_CANVAS} 0%, ${FNO_BG_CANVAS} 35%, transparent 100%)`,
          }}
        />
        <div
          ref={scrollRef}
          className={`${LEVELS_SYMBOL_STRIP_SCROLL_CLASS} h-full w-full flex flex-row flex-nowrap gap-1.5 pr-0.5`}
        >
          {entries.map((entry, i) => {
            const active = i === activeIndex;
            const pulse = active && runnerPulse;
            return (
              <button
                key={entry.id}
                data-strip-index={i}
                onClick={() => onSelect(i)}
                className="flex text-left shrink-0 h-full min-w-[4.75rem] max-w-[7.25rem] snap-center md:min-w-[9.5rem] md:max-w-[11rem] max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:py-1 max-md:px-2 flex-col gap-1 px-3 py-2 transition-[transform,box-shadow,background-color,border-color] duration-500 ease-out rounded-lg"
                style={{
                  backgroundColor: active ? accent.bg : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active ? (pulse ? accent.borderPulse : accent.border) : "rgba(255,255,255,0.05)"}`,
                  transform: pulse ? "scale(1.04)" : active ? "scale(1.01)" : "scale(1)",
                  boxShadow: pulse ? accent.glow : active ? accent.glowSoft : undefined,
                }}
              >
                <div className="md:hidden flex flex-col justify-center min-w-0 w-full gap-0.5">
                  <span
                    className="text-[11px] font-bold leading-none truncate"
                    style={{ color: "#e2e8f0" }}
                  >
                    {entry.label}
                  </span>
                  {(entry.spot != null && entry.currency) || entry.trailing ? (
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      {entry.spot != null && entry.currency ? (
                        <span
                          className="text-[9px] font-mono tabular-nums leading-none truncate min-w-0"
                          style={{ color: "#94a3b8" }}
                        >
                          {formatHeroPrice(entry.spot, entry.currency)}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1" />
                      )}
                      {entry.trailing ? (
                        <span className="shrink-0 scale-[0.88] origin-right">{entry.trailing}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="hidden md:flex flex-col gap-1 w-full min-w-0">
                  {(entry.sublabel || entry.trailing) && (
                    <div className="flex items-center justify-between gap-2 w-full">
                      {entry.sublabel ? (
                        <span
                          className="text-[7px] font-black uppercase px-1 py-0.5 rounded shrink-0"
                          style={{ color: accent.sublabel, backgroundColor: accent.sublabelBg }}
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
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const stripScrollClass =
    layout === "horizontal"
      ? "flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex flex-row gap-1.5 pb-1 pr-0.5 snap-x snap-mandatory [scrollbar-width:thin]"
      : layout === "responsive"
        ? "flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex flex-row gap-1.5 pb-1 pr-0.5 snap-x snap-mandatory [scrollbar-width:thin] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:snap-none lg:pb-0"
        : "flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5";

  return (
    <aside className="flex flex-col min-h-0 w-full min-w-0 flex-1 h-full max-md:h-auto">
      {header}
      {countLabel && (
        <p
          className="text-[9px] font-black uppercase tracking-[0.14em] mb-2 shrink-0 px-0.5"
          style={{ color: "#64748b" }}
        >
          {countLabel}
        </p>
      )}
      <div className="flex flex-col flex-1 min-h-0">
        <div
          className={stripScrollClass}
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
              data-strip-index={i}
              onClick={() => onSelect(i)}
              className={`flex text-left shrink-0 h-12 md:h-full ${stripCard} flex-col gap-1 px-3 py-2 transition-all rounded-lg`}
              style={{
                backgroundColor: active ? accent.bg : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? accent.border : "rgba(255,255,255,0.05)"}`,
              }}
            >
              {(entry.sublabel || entry.trailing) && (
                <div className="flex items-center justify-between gap-2 w-full">
                  {entry.sublabel ? (
                    <span
                      className="text-[7px] font-black uppercase px-1 py-0.5 rounded shrink-0"
                      style={{ color: accent.sublabel, backgroundColor: accent.sublabelBg }}
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
  zonesUpdatedLabel,
  slideshowAdvanceHint,
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
  zonesUpdatedLabel?: string | null;
  /** When true, append "Advances every 60s" (slideshow auto-advance). */
  slideshowAdvanceHint?: boolean;
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
        {(zonesUpdatedLabel || slideshowAdvanceHint) && (
          <p className="text-[10px] leading-snug" style={{ color: "#64748b" }}>
            {zonesUpdatedLabel ?? "Awaiting zone update"}
            {slideshowAdvanceHint && slideCount > 1 && !slideshowPaused ? (
              <span> · Advances every 60s</span>
            ) : null}
            {slideshowAdvanceHint && slideCount > 1 && slideshowPaused ? (
              <span style={{ color: "#f472b6" }}> · Slide paused</span>
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
  zonesUpdatedLabel,
  slideshowAdvanceHint,
  slideshowPaused,
}: {
  slideCount: number;
  activeIndex: number;
  onGoTo: (index: number) => void;
  zonesUpdatedLabel?: string | null;
  /** When true, append "Advances every 60s" (slideshow auto-advance). */
  slideshowAdvanceHint?: boolean;
  slideshowPaused?: boolean;
}) {
  if (slideCount <= 1 && !zonesUpdatedLabel) return null;
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
      {zonesUpdatedLabel && (
        <p className="text-[10px] leading-snug" style={{ color: "#64748b" }}>
          {zonesUpdatedLabel}
          {slideshowAdvanceHint && slideCount > 1 && !slideshowPaused ? (
            <span> · Advances every 60s</span>
          ) : null}
          {slideshowAdvanceHint && slideCount > 1 && slideshowPaused ? (
            <span style={{ color: "#f472b6" }}> · Slide paused</span>
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
  compactHeight = false,
  chartChrome,
}: {
  list: ReactNode;
  levels: ReactNode;
  chart: ReactNode;
  /** Optional recent-news rail. With listAboveChart chart 60% : news 40% from sm+. */
  news?: ReactNode;
  /** Native chart already draws POC / bull / bear — drop the center ladder. */
  hideLevelsColumn?: boolean;
  /** Slideshow: filters + tickers in one row above; chart 60% : news 40% from sm+. */
  listAboveChart?: boolean;
  /** Learn embed: drop mobile min-heights so parent height clamp applies. */
  compactHeight?: boolean;
  /** Stock title + toolbar row directly above the chart (inside chart column). */
  chartChrome?: ReactNode;
}) {
  if (listAboveChart) {
    return (
      <LevelsChartNewsSplit
        className="pt-2 sm:pt-3 border-t border-white/[0.04]"
        chartHeader={chartChrome}
        chart={chart}
        news={news}
      />
    );
  }

  return (
    <div
      className="flex flex-col lg:flex-row flex-1 min-h-0 gap-2 sm:gap-3 lg:gap-4 items-stretch pt-2 sm:pt-3 max-md:overflow-visible md:overflow-hidden min-w-0"
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
