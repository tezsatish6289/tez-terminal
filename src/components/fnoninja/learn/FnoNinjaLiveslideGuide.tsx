"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { LevelsChartChrome } from "@/components/levels/LevelsChartChrome";
import {
  LevelsChartMetaFooter,
  LevelsSymbolList,
  LevelsTripleColumnShell,
  type LevelsListEntry,
} from "@/components/levels/LevelsSplitLayout";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import { LevelsSlideshowToolbar } from "@/components/levels/LevelsSlideshowToolbar";
import { NativeCandlesChart, type NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import {
  buildLevelsBubbleItems,
  type LevelsBubbleItem,
  type StockBubbleSource,
} from "@/components/levels/LevelsBubblesView";
import { SLIDESHOW_SLIDE_SECONDS } from "@/components/levels/levels-symbol-strip";
import { zonesUpdatedFooterLabel } from "@/lib/levels/slideshow-zones";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  countSlideshowMapFilters,
  isSlideshowStripTone,
  slideshowMatchesMapFilter,
  type SlideshowMapFilter,
} from "@/lib/zones/bubble-map-filter";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import {
  zoneStatusDisplayKey,
  type ZoneBands,
  type ZoneDisplayKey,
} from "@/lib/zones/zone-status";
import { FNO_ACCENT, FNO_APP_SURFACE_STYLE, FNO_BG_CANVAS } from "@/lib/fnoninja/theme";

const TOUR_AUTO_SECONDS = 8;

interface LevelsPayload {
  indices?: { symbol?: string; label: string; data: PublicLevels | null }[];
  stocks?: StockBubbleSource[];
}

type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "filter",
    selector: '[aria-label^="Filter:"]',
    title: "Zone filter",
    body: "Tap ALL to narrow to At Support, Near Support, At Resistance, or Near Resistance. Only zone-qualified setups with a healthy reward to Max Pain appear in Liveslide.",
    placement: "bottom",
  },
  {
    id: "live",
    selector: '[aria-label^="Liveslide"]',
    title: "Live count",
    body: "Shows how many aligned setups match your filter right now — the same live universe as the market map, pre-scored for you.",
    placement: "bottom",
  },
  {
    id: "pause",
    selector: '[aria-label*="Pause slideshow"], [aria-label*="Resume slideshow"]',
    title: "Pause or play",
    body: "Liveslide auto-advances every 60 seconds. Pause when something catches your eye — the countdown shows seconds until the next symbol.",
    placement: "bottom",
  },
  {
    id: "bubbles",
    selector: '[aria-label*="Bubbles map"]',
    title: "Back to map",
    body: "Return to the full bubble map anytime. Press B or click Bubbles on the real product.",
    placement: "bottom",
  },
  {
    id: "strip",
    selector: "[data-learn-strip]",
    title: "Symbol strip",
    body: "Every qualifying name sits here with its status badge. Click any tile to jump — or let the rotation bring each setup to you.",
    placement: "bottom",
  },
  {
    id: "chart",
    selector: "[data-learn-chart]",
    title: "Live chart with zones",
    body: "Support and resistance bands, Put/Call OI peaks, and Max Pain are drawn on live 15M candles — the same derived zones as the map, in full chart context.",
    placement: "top",
  },
  {
    id: "tradingview",
    selector: '[aria-label="Open full chart on TradingView in a new tab. Press T or click."]',
    title: "Long-term trends on TradingView",
    body: "See longer-term trend confluence too — click the chart footer link or press T on your keyboard to open this symbol on TradingView.",
    placement: "top",
  },
  {
    id: "news",
    selector: "[data-learn-news]",
    title: "Recent news",
    body: "Each slide includes an AI summary of recent headlines with sentiment and citations — context to read alongside the chart, not a trade signal from us.",
    placement: "left",
  },
  {
    id: "footer",
    selector: "[data-learn-footer]",
    title: "Auto-advance or pick a slide",
    body: "Dot indicators jump to any slide. When playing, Liveslide advances every 60s — sit back and scan, or pause to study one name.",
    placement: "top",
  },
];

const STATUS_META: Record<
  ZoneDisplayKey,
  { label: string; color: string; bg: string }
> = {
  IN_BULL: {
    label: "At Support",
    color: LEVELS_ZONE_CHART.bull.labelText,
    bg: LEVELS_ZONE_CHART.bull.bandFillSoft,
  },
  NEAR_BULL: {
    label: "Near Support",
    color: "#86efac",
    bg: "rgba(34,197,94,0.12)",
  },
  IN_BEAR: {
    label: "At Resistance",
    color: LEVELS_ZONE_CHART.bear.labelText,
    bg: LEVELS_ZONE_CHART.bear.bandFillSoft,
  },
  NEAR_BEAR: {
    label: "Near Resistance",
    color: "#fca5a5",
    bg: "rgba(239,68,68,0.12)",
  },
  NEUTRAL: { label: "Neutral", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  ILLIQUID: { label: "No Data", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

function StatusBadge({ bands }: { bands: ZoneBands }) {
  const key = zoneStatusDisplayKey(bands);
  const m = STATUS_META[key];
  const Icon =
    key === "IN_BULL" || key === "NEAR_BULL"
      ? TrendingUp
      : key === "IN_BEAR" || key === "NEAR_BEAR"
        ? TrendingDown
        : Target;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide shrink-0 max-w-[5.75rem] leading-tight text-right"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{m.label}</span>
    </span>
  );
}

function useTourRect(container: HTMLElement | null, selector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!container) {
      setRect(null);
      return;
    }
    const el = container.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const c = container.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    setRect(new DOMRect(t.left - c.left, t.top - c.top, t.width, t.height));
  }, [container, selector]);

  useEffect(() => {
    measure();
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    const id = window.setInterval(measure, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [container, measure]);

  return rect;
}

function LearnTourOverlay({
  containerRef,
  step,
  stepIndex,
  tourAuto,
  onToggleAuto,
  onNext,
  onPrev,
  onDismiss,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  step: TourStep;
  stepIndex: number;
  tourAuto: boolean;
  onToggleAuto: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}) {
  const container = containerRef.current;
  const rect = useTourRect(container, step.selector);
  const isLast = stepIndex >= TOUR_STEPS.length - 1;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {rect ? (
        <div
          className="absolute rounded-lg transition-all duration-300 ease-out"
          style={{
            left: rect.x - 3,
            top: rect.y - 3,
            width: rect.width + 6,
            height: rect.height + 6,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)",
            border: "2px solid rgba(96,165,250,0.95)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/75" />
      )}

      <div
        className="absolute left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm pointer-events-auto"
        style={{
          top:
            step.placement === "top" && rect
              ? Math.max(12, rect.y - 8)
              : step.placement === "bottom" && rect
                ? Math.min(
                    (container?.clientHeight ?? 600) - 180,
                    rect.y + rect.height + 12,
                  )
                : undefined,
          bottom: step.placement === "top" || step.placement === "bottom" ? undefined : 16,
          transform:
            step.placement === "top" && rect ? "translateY(-100%)" : undefined,
        }}
      >
        <div
          className="rounded-xl p-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(8,15,30,0.97)",
            border: "1px solid rgba(96,165,250,0.45)",
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: FNO_ACCENT }}
          >
            {stepIndex + 1} of {TOUR_STEPS.length}
            {tourAuto ? " · auto-playing" : ""}
          </p>
          <p className="text-sm font-bold text-white mb-1.5">{step.title}</p>
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
            {step.body}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={onPrev}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.35)" }}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              {isLast ? "Finish tour" : "Next"}
            </button>
            <button
              type="button"
              onClick={onToggleAuto}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: tourAuto ? "#86efac" : "#94a3b8", border: "1px solid rgba(148,163,184,0.25)" }}
            >
              {tourAuto ? "Pause auto-play" : "Auto-play tour"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto text-xs font-semibold hover:underline"
              style={{ color: "#64748b" }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FnoNinjaLiveslideGuide() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);

  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SlideshowMapFilter>("all");
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(SLIDESHOW_SLIDE_SECONDS);
  const [levelsCache, setLevelsCache] = useState<Record<string, PublicLevels | null>>({});
  const [chartFullHistory, setChartFullHistory] = useState(true);
  const [liveStripSpot, setLiveStripSpot] = useState<Record<string, number>>({});

  const [tourStep, setTourStep] = useState(0);
  const [tourAuto, setTourAuto] = useState(true);
  const [tourDismissed, setTourDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: LevelsPayload) => {
        if (!cancelled) setPayload(json);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stockBySymbol = useMemo(() => {
    const m = new Map<string, StockBubbleSource>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const aligned = useMemo<LevelsBubbleItem[]>(() => {
    if (!payload?.indices) return [];
    return buildLevelsBubbleItems(payload.indices, stockBySymbol).filter((it) =>
      isSlideshowStripTone(it.tone),
    );
  }, [payload?.indices, stockBySymbol]);

  const counts = useMemo(() => countSlideshowMapFilters(aligned), [aligned]);

  const filtered = useMemo(() => {
    return aligned
      .filter((it) => slideshowMatchesMapFilter(it.tone, filter))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [aligned, filter]);

  useEffect(() => {
    setSlideIndex(0);
  }, [filter]);

  useEffect(() => {
    setCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [slideIndex, filter]);

  useEffect(() => {
    if (paused || filtered.length <= 1) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setSlideIndex((s) => (s + 1) % filtered.length);
          return SLIDESHOW_SLIDE_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused, filtered.length]);

  useEffect(() => {
    if (tourDismissed || !tourAuto) return;
    const t = setInterval(() => {
      setTourStep((s) => {
        if (s >= TOUR_STEPS.length - 1) {
          setTourDismissed(true);
          return s;
        }
        return s + 1;
      });
    }, TOUR_AUTO_SECONDS * 1000);
    return () => clearInterval(t);
  }, [tourAuto, tourDismissed]);

  const active = filtered.length ? filtered[Math.min(slideIndex, filtered.length - 1)] : null;
  const activeId = active ? `${active.scope}-${active.symbol}` : "";

  useEffect(() => {
    if (!active || active.scope !== "stock") return;
    if (levelsCache[active.symbol] !== undefined) return;
    let cancelled = false;
    void fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(active.symbol)}&slideshow=1`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { data: PublicLevels | null }) => {
        if (!cancelled) setLevelsCache((prev) => ({ ...prev, [active.symbol]: json.data ?? null }));
      })
      .catch(() => {
        if (!cancelled) setLevelsCache((prev) => ({ ...prev, [active.symbol]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [active?.symbol, active?.scope, levelsCache]);

  const activeLevels = active
    ? active.scope === "index"
      ? active.data
      : levelsCache[active.symbol] ?? null
    : null;
  const activeLevelsLoading = active
    ? active.scope === "stock" && levelsCache[active.symbol] === undefined
    : false;
  const tv = active ? levelsTradingViewParams(active.scope, active.symbol) : null;

  const activeSubtitle = useMemo(() => {
    if (!active) return null;
    const name = fnoCompanyName(active.symbol) ?? active.label;
    if (name.toUpperCase() !== active.symbol.toUpperCase()) return name;
    return active.label.toUpperCase() !== active.symbol.toUpperCase() ? active.label : null;
  }, [active]);

  const stripEntries: LevelsListEntry[] = useMemo(
    () =>
      filtered.map((it) => {
        const id = `${it.scope}-${it.symbol}`;
        const data = it.scope === "index" ? it.data : levelsCache[it.symbol] ?? null;
        const bands = bandsFromLevels(data, it.spot);
        return {
          id,
          label: it.label,
          sublabel: it.scope === "index" ? "Index" : "Stock",
          spot: liveStripSpot[id] ?? it.spot,
          currency: "₹" as const,
          trailing: <StatusBadge bands={bands} />,
        };
      }),
    [filtered, levelsCache, liveStripSpot],
  );

  const zonesUpdatedLabel = zonesUpdatedFooterLabel(activeLevels?.computedAt);

  const handleChartLastClose = useCallback(
    (close: number) => {
      if (!activeId) return;
      setLiveStripSpot((prev) => ({ ...prev, [activeId]: close }));
    },
    [activeId],
  );

  const symbolStrip =
    filtered.length > 0 ? (
      <div data-learn-strip className="h-full min-w-0">
        <LevelsSymbolList
          entries={stripEntries}
          activeIndex={Math.min(slideIndex, filtered.length - 1)}
          onSelect={setSlideIndex}
          layout="horizontal"
          runnerMode
          stripAccent="liveslide"
        />
      </div>
    ) : null;

  const chartChrome =
    tv && active ? (
      <LevelsChartChrome
        symbol={active.symbol}
        subtitle={activeSubtitle}
        config={tv}
        nativeChartRef={nativeChartRef}
        chartFullHistory={chartFullHistory}
        hideToolbar
      />
    ) : null;

  return (
    <section>
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: FNO_ACCENT }}>
          See it live
        </p>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
          The real Liveslide layout — with a guided walkthrough
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          This is the same Liveslide you get on the market map: filters, symbol strip, live chart with
          zones, news, and auto-advance. The overlay tour auto-plays through each control — or click{" "}
          <strong className="text-slate-300">Next</strong> to move at your pace.
        </p>
        {tourDismissed ? (
          <button
            type="button"
            onClick={() => {
              setTourDismissed(false);
              setTourStep(0);
              setTourAuto(true);
            }}
            className="mt-3 text-xs font-semibold hover:underline"
            style={{ color: FNO_ACCENT }}
          >
            Restart guided tour
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden flex flex-col min-h-[min(88dvh,820px)]"
        style={{
          ...FNO_APP_SURFACE_STYLE,
          border: "1px solid rgba(90,140,220,0.2)",
          backgroundColor: FNO_BG_CANVAS,
        }}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-24">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Loading live setups…
            </span>
          </div>
        ) : aligned.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-20 text-center">
            <div>
              <p className="text-sm font-semibold text-white mb-1">No setups are aligned right now</p>
              <p className="text-xs leading-relaxed max-w-sm mx-auto" style={{ color: "#64748b" }}>
                Liveslide stays empty until price reaches a support or resistance zone with at least a
                2:1 reward to Max Pain. Check back during market hours.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-1 sm:px-2 pt-2 pb-2">
            <LevelsSlideshowToolbar
              filtersOnly
              slideshowFilter={filter}
              onSlideshowFilterChange={setFilter}
              slideshowFilterCounts={counts}
              symbolStrip={symbolStrip}
              slideshowControl={{
                enabled: filtered.length > 0,
                paused,
                onToggle: () => setPaused((p) => !p),
                secondsRemaining: countdown,
              }}
              slideModePill={{ mode: "liveslide", count: filtered.length }}
              viewModeToggle={{
                viewMode: "liveslide",
                onToggle: () => {},
                title: "Back to Market Bubbles map. Press B or click.",
              }}
            />

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <LevelsTripleColumnShell
                list={<></>}
                levels={<></>}
                hideLevelsColumn
                listAboveChart
                chartChrome={chartChrome ?? undefined}
                news={
                  active ? (
                    <div data-learn-news className="h-full min-h-[16rem] lg:min-h-0">
                      <LevelsNewsPanel scope={active.scope} symbol={active.symbol} className="h-full" />
                    </div>
                  ) : undefined
                }
                chart={
                  <div className="flex flex-col flex-1 min-h-0 min-w-0">
                    <div
                      data-learn-chart
                      className="relative flex flex-1 min-h-[min(36dvh,360px)] lg:min-h-0 min-w-0"
                    >
                      {tv ? (
                        <NativeCandlesChart
                          key={`${active?.scope}-${active?.symbol}`}
                          ref={nativeChartRef}
                          symbol={tv.symbol}
                          candlesScope={tv.candlesScope}
                          interval="15"
                          levels={activeLevels}
                          loading={activeLevelsLoading}
                          webChartUrl={tv.webChartUrl}
                          hideShortcuts
                          defaultFullHistory
                          onFullHistoryZoomChange={setChartFullHistory}
                          onLastCloseChange={handleChartLastClose}
                        />
                      ) : null}
                    </div>
                    <div data-learn-footer>
                      <LevelsChartMetaFooter
                        slideCount={filtered.length}
                        activeIndex={Math.min(slideIndex, Math.max(filtered.length - 1, 0))}
                        onGoTo={setSlideIndex}
                        zonesUpdatedLabel={zonesUpdatedLabel}
                        slideshowAdvanceHint
                        slideshowPaused={paused}
                      />
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        )}

        {!tourDismissed && !loading && aligned.length > 0 ? (
          <LearnTourOverlay
            containerRef={containerRef}
            step={TOUR_STEPS[tourStep]!}
            stepIndex={tourStep}
            tourAuto={tourAuto}
            onToggleAuto={() => setTourAuto((v) => !v)}
            onNext={() => {
              if (tourStep >= TOUR_STEPS.length - 1) setTourDismissed(true);
              else setTourStep((s) => s + 1);
            }}
            onPrev={() => setTourStep((s) => Math.max(0, s - 1))}
            onDismiss={() => setTourDismissed(true)}
          />
        ) : null}
      </div>

      {active && tv ? (
        <p className="mt-3 text-xs text-center" style={{ color: "#64748b" }}>
          {active.symbol} · {formatLevelsChartMeta(tv)} · interact freely once the tour is done
        </p>
      ) : null}
    </section>
  );
}
