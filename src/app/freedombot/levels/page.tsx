"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, TrendingUp, TrendingDown, Target } from "lucide-react";
import { type PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  LevelsChartPanel,
  LevelsDisclaimer,
  LevelsTripleColumnShell,
  LevelsChartMetaFooter,
  LevelsSymbolList,
  type LevelsListEntry,
} from "@/components/levels/LevelsSplitLayout";
import {
  buildLevelsBubbleItems,
  LevelsBubblesView,
} from "@/components/levels/LevelsBubblesView";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { LevelsChartChrome } from "@/components/levels/LevelsChartChrome";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import { LevelsSlideshowToolbar } from "@/components/levels/LevelsSlideshowToolbar";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { levelsChartPagePath } from "@/lib/levels/levels-chart-url";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  bandsFromLevels,
  buildLevelsActionableList,
  type LevelsActionableItem,
} from "@/lib/zones/levels-actionable-list";
import { SLIDESHOW_SLIDE_SECONDS } from "@/components/levels/levels-symbol-strip";
import { FB_FULL_HEIGHT_MAIN, FB_LEVELS_SHELL } from "@/lib/freedombot/responsive";
import {
  deriveZoneStatus,
  type PocDirectionFilter,
  type ZoneStatus,
} from "@/lib/zones/zone-status";

interface RawItem {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface StockListItem {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  halfWidth?: number | null;
  computedAt?: string | null;
}

type InZoneItem = LevelsActionableItem;

interface LevelsPayload {
  indices: RawItem[];
  stocks: StockListItem[];
  inZone: InZoneItem[];
  updatedAt: string;
}

type LevelsViewMode = "bubbles" | "slideshow";

const HEX_BG = `
  radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
  #060912
`;

const STATUS_META: Record<ZoneStatus, { label: string; color: string; bg: string }> = {
  IN_BULL: {
    label: "At Support",
    color: LEVELS_ZONE_CHART.bull.badgeText,
    bg: LEVELS_ZONE_CHART.bull.badgeBg,
  },
  IN_BEAR: {
    label: "At Resistance",
    color: LEVELS_ZONE_CHART.bear.badgeText,
    bg: LEVELS_ZONE_CHART.bear.badgeBg,
  },
  NEAR: { label: "Near Zone", color: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
  NEUTRAL: { label: "Neutral", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  ILLIQUID: { label: "No Data", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

function StatusBadge({ status }: { status: ZoneStatus }) {
  const m = STATUS_META[status];
  const Icon = status === "IN_BULL" ? TrendingUp : status === "IN_BEAR" ? TrendingDown : Target;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function levelsHaveBands(data: PublicLevels | null | undefined): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

function resolveStockCompanyName(symbol: string, fallback?: string | null): string | null {
  const fromMap = fnoCompanyName(symbol);
  if (fromMap) return fromMap;
  const fb = fallback?.trim();
  if (fb && fb.toUpperCase() !== symbol.toUpperCase()) return fb;
  return null;
}

function formatRefreshed(computedAt: string | null | undefined): string | null {
  if (!computedAt) return null;
  return new Date(computedAt).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LevelsPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LevelsViewMode>("bubbles");
  const [zoneFilter, setZoneFilter] = useState<PocDirectionFilter>("all");
  const [inZoneSlide, setInZoneSlide] = useState(0);
  const [inZoneChartData, setInZoneChartData] = useState<PublicLevels | null>(null);
  const [inZoneChartLoading, setInZoneChartLoading] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [slideshowCountdown, setSlideshowCountdown] = useState(SLIDESHOW_SLIDE_SECONDS);
  const [bubblesHideNeutral, setBubblesHideNeutral] = useState(false);
  const [chartFullHistory, setChartFullHistory] = useState(false);
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      setPayload(json);
    } catch {
      /* keep last-good */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "bubbles" ? "slideshow" : "bubbles"));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleViewMode();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleViewMode]);

  const inZoneListSorted = useMemo(
    () =>
      payload
        ? buildLevelsActionableList({
            indices: payload.indices,
            stocks: payload.stocks,
            filter: "all",
          })
        : [],
    [payload],
  );

  const inZoneFilterCounts = useMemo(
    () => ({
      all: inZoneListSorted.length,
      bull: payload
        ? buildLevelsActionableList({
            indices: payload.indices,
            stocks: payload.stocks,
            filter: "bull",
          }).length
        : 0,
      bear: payload
        ? buildLevelsActionableList({
            indices: payload.indices,
            stocks: payload.stocks,
            filter: "bear",
          }).length
        : 0,
    }),
    [payload, inZoneListSorted.length],
  );

  const inZoneListFiltered = useMemo(
    () =>
      payload
        ? buildLevelsActionableList({
            indices: payload.indices,
            stocks: payload.stocks,
            filter: zoneFilter,
          })
        : [],
    [payload, zoneFilter],
  );

  const actionableBubbleIds = useMemo(
    () => new Set(inZoneListFiltered.map((it) => `${it.scope}-${it.symbol}`)),
    [inZoneListFiltered],
  );

  const stockBySymbol = useMemo(() => {
    const m = new Map<
      string,
      {
        symbol: string;
        label: string;
        spot: number | null;
        maxPain: number | null;
        bullZoneLow: number | null;
        bullZoneHigh: number | null;
        bearZoneLow: number | null;
        bearZoneHigh: number | null;
        halfWidth?: number | null;
        computedAt?: string | null;
      }
    >();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  /** Full F&O map (all tones); actionable setups match slideshow filter. */
  const bubbleItems = useMemo(
    () =>
      payload
        ? buildLevelsBubbleItems(payload.indices, stockBySymbol, actionableBubbleIds)
        : [],
    [payload, stockBySymbol, actionableBubbleIds],
  );

  const inZoneCount = inZoneListFiltered.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? inZoneListFiltered[inZoneCurrent] : null;

  const slideshowEnabled = viewMode === "slideshow" && inZoneCount > 1;

  const toggleSlideshowPause = useCallback(() => {
    setSlideshowPaused((p) => {
      if (p) setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
      return !p;
    });
  }, []);

  const scheduleNote = "Updates Mon–Fri during market hours";

  const activeTv = useMemo(() => {
    if (viewMode !== "slideshow" || !inZoneActive) return null;
    return levelsTradingViewParams(inZoneActive.scope, inZoneActive.symbol);
  }, [viewMode, inZoneActive]);

  const activeChartLevels = useMemo<PublicLevels | null>(() => {
    if (viewMode !== "slideshow" || !inZoneActive) return null;
    return inZoneChartData;
  }, [viewMode, inZoneActive, inZoneChartData]);

  const chartShowsZones = Boolean(activeTv?.nativeCandles && levelsHaveBands(activeChartLevels));

  const activeTicker = inZoneActive?.symbol ?? null;

  const activeCompanyName = useMemo(() => {
    if (!inZoneActive) return null;
    if (inZoneActive.scope === "stock") {
      return resolveStockCompanyName(inZoneActive.symbol, inZoneActive.label);
    }
    return inZoneActive.label;
  }, [inZoneActive]);

  const slideshowSubtitleLine = useMemo(() => {
    if (!activeTicker) return null;
    const name = activeCompanyName?.trim();
    if (name && name.toUpperCase() !== activeTicker.toUpperCase()) return name;
    if (inZoneActive?.label && inZoneActive.label.toUpperCase() !== activeTicker.toUpperCase()) {
      return inZoneActive.label;
    }
    return null;
  }, [activeTicker, activeCompanyName, inZoneActive?.label]);

  const chartLevelsLoading =
    viewMode === "slideshow" && inZoneChartLoading && inZoneActive?.scope === "stock";

  const slideshowChartShortcuts =
    viewMode === "slideshow" && activeTv
      ? {
          webChartUrl: activeTv.webChartUrl,
          showSqueeze: Boolean(activeTv.nativeCandles),
          squeezed: chartFullHistory,
          onSqueeze: () => nativeChartRef.current?.toggleHistoryZoom(),
          showSlideshowControl: slideshowEnabled,
          slideshowPaused,
          onToggleSlideshowPause: toggleSlideshowPause,
        }
      : null;

  useEffect(() => {
    setChartFullHistory(viewMode === "slideshow");
  }, [activeTv?.symbol, activeTv?.exchange, activeTv?.candlesScope, viewMode]);

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  useEffect(() => {
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [inZoneCurrent, zoneFilter, viewMode]);

  useEffect(() => {
    if (slideshowPaused || viewMode !== "slideshow" || inZoneCount <= 1) return;
    const id = setInterval(() => {
      setSlideshowCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [slideshowPaused, viewMode, inZoneCount, inZoneCurrent, zoneFilter]);

  useEffect(() => {
    if (slideshowCountdown > 0) return;
    if (slideshowPaused || viewMode !== "slideshow" || inZoneCount <= 1) return;
    setInZoneSlide((s) => (s + 1) % inZoneCount);
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [slideshowCountdown, slideshowPaused, viewMode, inZoneCount]);

  useEffect(() => {
    if (inZoneCount === 0) setInZoneSlide(0);
    else if (inZoneSlide >= inZoneCount) setInZoneSlide(0);
  }, [inZoneCount, inZoneSlide]);

  useEffect(() => {
    if (!inZoneActive) {
      setInZoneChartData(null);
      return;
    }
    const bundled = inZoneActive.data;
    const hasBands = bundled != null && (bundled.bullLow != null || bundled.bearLow != null);
    const stockNeedsFullFetch =
      inZoneActive.scope === "stock" && hasBands && bundled!.poc == null;

    if (hasBands && !stockNeedsFullFetch) {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    if (inZoneActive.scope !== "stock") {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    let cancelled = false;
    setInZoneChartLoading(true);
    fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(inZoneActive.symbol)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { data: PublicLevels | null }) => {
        if (!cancelled) setInZoneChartData(json.data);
      })
      .catch(() => {
        if (!cancelled) setInZoneChartData(null);
      })
      .finally(() => {
        if (!cancelled) setInZoneChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inZoneActive?.scope, inZoneActive?.symbol, inZoneActive?.data, inZoneCurrent]);

  const openBubbleChart = useCallback((item: { scope: "index" | "stock"; symbol: string }) => {
    window.open(levelsChartPagePath(item.scope, item.symbol), "_blank", "noopener,noreferrer");
  }, []);

  const inZoneEntries: LevelsListEntry[] = useMemo(
    () =>
      inZoneListFiltered.map((it) => {
        const status = deriveZoneStatus(bandsFromLevels(it.data, it.spot));
        return {
          id: `${it.scope}-${it.symbol}`,
          label: it.label,
          sublabel: it.scope === "index" ? "Index" : "Stock",
          spot: it.spot,
          currency: it.currency,
          trailing: <StatusBadge status={status} />,
        };
      }),
    [inZoneListFiltered],
  );

  const tvChartColumn =
    activeTv != null ? (
      <LevelsTradingViewChart
        className="flex-1 min-h-0"
        config={activeTv}
        ticker={activeTicker ?? activeTv.symbol}
        companyName={activeCompanyName ?? undefined}
        levels={activeChartLevels}
        loading={chartLevelsLoading}
        showSlideshowControl={slideshowEnabled}
        slideshowPaused={slideshowPaused}
        onToggleSlideshowPause={toggleSlideshowPause}
        hideChartShortcuts={viewMode === "slideshow"}
        defaultFullHistory={viewMode === "slideshow"}
        showHeader={viewMode !== "slideshow"}
        nativeChartRef={nativeChartRef}
        onFullHistoryZoomChange={setChartFullHistory}
      />
    ) : (
      <div
        className="flex flex-1 items-center justify-center rounded-xl text-center px-4"
        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
      >
        <p className="text-xs">No aligned setups to chart</p>
      </div>
    );

  const slideshowNews =
    inZoneActive != null && activeTicker ? (
      <LevelsNewsPanel
        scope={inZoneActive.scope}
        symbol={activeTicker}
        className="h-full"
      />
    ) : null;

  const viewToggleLabel =
    viewMode === "bubbles"
      ? "Switch to slideshow view"
      : "Switch to bubbles view";
  const viewToggleShortcut = "(Press S for shortcut)";

  const slideshowChartChrome =
    activeTv != null && activeTicker ? (
      <LevelsChartChrome
        symbol={activeTicker}
        subtitle={slideshowSubtitleLine}
        config={activeTv}
        nativeChartRef={nativeChartRef}
        chartFullHistory={chartFullHistory}
        hideToolbar
      />
    ) : null;

  const slideshowSymbolStrip =
    viewMode === "slideshow" && inZoneCount > 0 ? (
      <LevelsSymbolList
        entries={inZoneEntries}
        activeIndex={inZoneCurrent}
        onSelect={setInZoneSlide}
        layout="horizontal"
      />
    ) : null;

  const wrapSlideshowBody = (
    list: ReactNode,
    levels: ReactNode,
    opts?: {
      hideLevelsColumn?: boolean;
      chartFooter?: ReactNode;
      news?: ReactNode;
      listAboveChart?: boolean;
    },
  ) => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <LevelsTripleColumnShell
        list={opts?.listAboveChart ? <></> : list}
        levels={levels}
        news={opts?.news}
        hideLevelsColumn={opts?.hideLevelsColumn ?? chartShowsZones}
        listAboveChart={opts?.listAboveChart}
        chartChrome={opts?.listAboveChart ? slideshowChartChrome : undefined}
        chart={
          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            <div className="flex flex-1 min-h-0 min-w-0 flex-col">{tvChartColumn}</div>
            {opts?.chartFooter}
          </div>
        }
      />
      <LevelsDisclaimer scheduleNote={scheduleNote} />
    </div>
  );

  const renderSlideshow = () => {
    if (inZoneCount === 0) {
      const filteredEmpty = zoneFilter !== "all" && inZoneListSorted.length > 0;
      return wrapSlideshowBody(
        <div className="flex flex-col min-h-0 h-full">
          <p className="text-sm text-center py-8 px-4" style={{ color: "#64748b" }}>
            {filteredEmpty
              ? "No symbols match this filter right now."
              : "No aligned setups right now."}
          </p>
        </div>,
        <div className="flex flex-1 items-center justify-center text-center px-4">
          <p className="text-xs max-w-xs leading-relaxed" style={{ color: "#475569" }}>
            {filteredEmpty
              ? "Try All aligned, or wait for price to sit in a band with max pain on the pull side."
              : "Needs spot inside bull/bear band and max pain above (bull) or below (bear) spot."}
          </p>
        </div>,
      );
    }

    const chartSpot = inZoneChartData?.spot ?? inZoneActive?.spot ?? null;
    const refreshed = formatRefreshed(inZoneChartData?.computedAt);
    const inZoneNativeChart = chartShowsZones && inZoneActive != null;

    return wrapSlideshowBody(
      inZoneNativeChart ? (
        <></>
      ) : (
        <LevelsSymbolList
          entries={inZoneEntries}
          activeIndex={inZoneCurrent}
          onSelect={setInZoneSlide}
          layout="responsive"
        />
      ),
      inZoneActive ? (
        inZoneNativeChart ? (
          <></>
        ) : (
          <LevelsChartPanel
            title={`${inZoneActive.label} Market Levels`}
            spot={chartSpot}
            currency={inZoneActive.currency}
            levels={inZoneChartData}
            loading={inZoneChartLoading}
            slideCount={inZoneCount}
            activeIndex={inZoneCurrent}
            onPrev={() => goInZone(-1)}
            onNext={() => goInZone(1)}
            onGoTo={setInZoneSlide}
            refreshedLabel={refreshed ? `Data refreshed ${refreshed}` : undefined}
            autoAdvanceNote
            slideshowPaused={slideshowPaused}
            showCarouselArrows={false}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center" style={{ color: "#64748b" }}>
          <p className="text-xs">No selection</p>
        </div>
      ),
      inZoneNativeChart
        ? {
            hideLevelsColumn: true,
            news: slideshowNews,
            listAboveChart: true,
            chartFooter: (
              <LevelsChartMetaFooter
                slideCount={inZoneCount}
                activeIndex={inZoneCurrent}
                onGoTo={setInZoneSlide}
                refreshedLabel={refreshed ? `Data refreshed ${refreshed}` : undefined}
                autoAdvanceNote
                slideshowPaused={slideshowPaused}
              />
            ),
          }
        : undefined,
    );
  };

  return (
    <main
      className={`${FB_FULL_HEIGHT_MAIN} shrink-0 min-w-0`}
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className={`${FB_LEVELS_SHELL} flex-1 min-h-0 flex flex-col overflow-hidden`}>
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <LevelsSlideshowToolbar
                zoneFilter={zoneFilter}
                onZoneFilterChange={(key) => {
                  setZoneFilter(key);
                  setInZoneSlide(0);
                }}
                filterCounts={inZoneFilterCounts}
                filtersOnly={viewMode === "slideshow" && activeTv != null}
                symbolStrip={
                  viewMode === "slideshow" && activeTv != null ? slideshowSymbolStrip : undefined
                }
                slideshowControl={
                  viewMode === "slideshow" && activeTv != null && slideshowEnabled
                    ? {
                        enabled: true,
                        paused: slideshowPaused,
                        onToggle: toggleSlideshowPause,
                        secondsRemaining: slideshowCountdown,
                      }
                    : undefined
                }
                viewModeToggle={
                  viewMode === "slideshow" && activeTv != null
                    ? {
                        viewMode: "slideshow",
                        onToggle: toggleViewMode,
                        title: viewToggleShortcut,
                      }
                    : undefined
                }
                chartShortcuts={
                  viewMode === "slideshow" && !activeTv ? slideshowChartShortcuts : null
                }
                viewToggle={{
                  label: viewToggleLabel,
                  shortLabel: viewMode === "bubbles" ? "Slideshow" : "Bubbles",
                  onClick: toggleViewMode,
                  title: viewToggleShortcut,
                }}
              />
              {viewMode === "bubbles" ? (
                <LevelsBubblesView
                  items={bubbleItems}
                  onBubbleOpen={openBubbleChart}
                  hasMarketData={Boolean(payload)}
                  hideNeutral={bubblesHideNeutral}
                  onHideNeutralChange={setBubblesHideNeutral}
                  headerActions={null}
                />
              ) : (
                renderSlideshow()
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
