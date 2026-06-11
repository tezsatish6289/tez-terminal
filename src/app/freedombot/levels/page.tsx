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
import { VolRegimeBadge } from "@/components/levels/VolRegimeBadge";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import { LevelsSlideshowToolbar } from "@/components/levels/LevelsSlideshowToolbar";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  bandsFromLevels,
  levelsFromStockRow,
  type LevelsActionableItem,
} from "@/lib/zones/levels-actionable-list";
import { SLIDESHOW_SLIDE_SECONDS } from "@/components/levels/levels-symbol-strip";
import { isHighConfidenceLevels } from "@/lib/levels/levels-source";
import {
  isSlideshowZoneStale,
  SLIDESHOW_ZONE_TICK_MS,
  zonesUpdatedFooterLabel,
} from "@/lib/levels/slideshow-zones";
import { FB_FULL_HEIGHT_MAIN, FB_LEVELS_SHELL } from "@/lib/freedombot/responsive";
import {
  bubbleMatchesMapFilter,
  countBubbleMapFilters,
  countSlideshowMapFilters,
  slideshowMatchesMapFilter,
  type BubbleMapFilter,
  type SlideshowMapFilter,
} from "@/lib/zones/bubble-map-filter";
import {
  deriveZoneStatus,
  type ZoneDisplayKey,
  type ZoneStatus,
  zoneStatusDisplayKey,
  type ZoneBands,
} from "@/lib/zones/zone-status";
import type { LevelsBubbleItem } from "@/components/levels/LevelsBubblesView";

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
  levelsSource?: PublicLevels["levelsSource"];
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

const STATUS_META: Record<ZoneDisplayKey, { label: string; color: string; bg: string }> = {
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
  NEAR_BULL: {
    label: "Near Support",
    color: LEVELS_ZONE_CHART.bull.badgeText,
    bg: LEVELS_ZONE_CHART.bull.bandFillSoft,
  },
  NEAR_BEAR: {
    label: "Near Resistance",
    color: LEVELS_ZONE_CHART.bear.badgeText,
    bg: LEVELS_ZONE_CHART.bear.bandFillSoft,
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

function levelsHaveBands(data: PublicLevels | null | undefined): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

function bubbleItemToActionable(
  it: LevelsBubbleItem,
  stockBySymbol: Map<string, Parameters<typeof levelsFromStockRow>[0]>,
): LevelsActionableItem {
  const row = it.scope === "stock" ? stockBySymbol.get(it.symbol) : undefined;
  const data = it.data ?? (row ? levelsFromStockRow(row) : null);
  return {
    scope: it.scope,
    symbol: it.symbol,
    label: it.label,
    status: deriveZoneStatus(it.bands),
    spot: it.spot,
    currency: "₹",
    data,
  };
}

function resolveStockCompanyName(symbol: string, fallback?: string | null): string | null {
  const fromMap = fnoCompanyName(symbol);
  if (fromMap) return fromMap;
  const fb = fallback?.trim();
  if (fb && fb.toUpperCase() !== symbol.toUpperCase()) return fb;
  return null;
}

export default function LevelsPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LevelsViewMode>("bubbles");
  const [inZoneSlide, setInZoneSlide] = useState(0);
  const [inZoneChartData, setInZoneChartData] = useState<PublicLevels | null>(null);
  const [inZoneChartLoading, setInZoneChartLoading] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [slideshowCountdown, setSlideshowCountdown] = useState(SLIDESHOW_SLIDE_SECONDS);
  const [bubbleMapFilter, setBubbleMapFilter] = useState<BubbleMapFilter>("all");
  const [slideshowFilter, setSlideshowFilter] = useState<SlideshowMapFilter>("all");
  const [bubbleSearch, setBubbleSearch] = useState("");
  const [chartFullHistory, setChartFullHistory] = useState(false);
  /** Last candle close per symbol — strip tiles match native chart price. */
  const [liveStripSpot, setLiveStripSpot] = useState<Record<string, number>>({});
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);
  const activeStripKeyRef = useRef("");
  const chartLevelsSymbolRef = useRef<string | null>(null);

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
        levelsSource?: PublicLevels["levelsSource"];
      }
    >();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  /** Full F&O map — zone tones gated by 2:1 POC RR (bubble + slideshow). */
  const bubbleItems = useMemo(
    () =>
      payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol) : [],
    [payload, stockBySymbol],
  );

  const bubbleFilterCounts = useMemo(
    () => countBubbleMapFilters(bubbleItems),
    [bubbleItems],
  );

  const slideshowFilterCounts = useMemo(
    () => countSlideshowMapFilters(bubbleItems),
    [bubbleItems],
  );

  /** Slideshow strip — zone setups only (at/near support/resistance). */
  const inZoneListFiltered = useMemo(() => {
    const q = bubbleSearch.trim().toUpperCase();
    return bubbleItems
      .filter((it) => {
        if (!slideshowMatchesMapFilter(it.tone, slideshowFilter)) return false;
        if (!q) return true;
        return (
          it.symbol.toUpperCase().includes(q) ||
          it.label.toUpperCase().includes(q)
        );
      })
      .map((it) => bubbleItemToActionable(it, stockBySymbol))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [bubbleItems, slideshowFilter, bubbleSearch, stockBySymbol]);

  const inZoneCount = inZoneListFiltered.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? inZoneListFiltered[inZoneCurrent] : null;

  useEffect(() => {
    activeStripKeyRef.current = inZoneActive
      ? `${inZoneActive.scope}-${inZoneActive.symbol}`
      : "";
  }, [inZoneActive?.scope, inZoneActive?.symbol]);

  const handleChartLastClose = useCallback((close: number) => {
    const key = activeStripKeyRef.current;
    if (!key || !Number.isFinite(close)) return;
    setLiveStripSpot((prev) => (prev[key] === close ? prev : { ...prev, [key]: close }));
  }, []);

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

  /** Chart + news rail — stable for all native-candle slideshow symbols (not gated on levels load). */
  const slideshowNativeLayout = Boolean(
    viewMode === "slideshow" && activeTv?.nativeCandles && inZoneActive != null,
  );

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
    viewMode === "slideshow" &&
    inZoneChartLoading &&
    inZoneActive?.scope === "stock" &&
    !levelsHaveBands(inZoneChartData);

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
  }, [inZoneCurrent, slideshowFilter, viewMode]);

  useEffect(() => {
    if (slideshowPaused || viewMode !== "slideshow" || inZoneCount <= 1) return;
    const id = setInterval(() => {
      setSlideshowCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [slideshowPaused, viewMode, inZoneCount, inZoneCurrent, slideshowFilter]);

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

  const refreshOneSlideshowStockZone = useCallback(
    async (symbol: string, updateActiveChart: boolean) => {
      try {
        const res = await fetch(
          `/api/freedombot/levels?symbol=${encodeURIComponent(symbol)}&slideshow=1`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { data: PublicLevels | null };
        if (updateActiveChart && json.data) {
          setInZoneChartData(json.data);
        }
        await load();
      } catch {
        /* keep last-good */
      }
    },
    [load],
  );

  useEffect(() => {
    if (!inZoneActive) {
      chartLevelsSymbolRef.current = null;
      setInZoneChartData(null);
      return;
    }
    const activeKey = `${inZoneActive.scope}-${inZoneActive.symbol}`;
    const symbolChanged = chartLevelsSymbolRef.current !== activeKey;
    chartLevelsSymbolRef.current = activeKey;

    const bundled = inZoneActive.data;
    const hasBands = bundled != null && (bundled.bullLow != null || bundled.bearLow != null);
    const stockNeedsFullFetch =
      inZoneActive.scope === "stock" && hasBands && bundled!.poc == null;
    const slideshowStaleStock =
      viewMode === "slideshow" &&
      inZoneActive.scope === "stock" &&
      isSlideshowZoneStale(bundled?.computedAt);

    if (hasBands && !stockNeedsFullFetch && !slideshowStaleStock) {
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
    if (symbolChanged) {
      setInZoneChartData(null);
    }
    const q = viewMode === "slideshow" ? "&slideshow=1" : "";
    fetch(
      `/api/freedombot/levels?symbol=${encodeURIComponent(inZoneActive.symbol)}${q}`,
      { cache: "no-store" },
    )
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
  }, [inZoneActive?.scope, inZoneActive?.symbol, inZoneActive?.data, inZoneCurrent, viewMode]);

  /** Keep in-zone slideshow stocks on a ≤5m zone refresh cadence (one symbol per tick). */
  useEffect(() => {
    if (viewMode !== "slideshow") return;

    let cancelled = false;
    let roundRobin = 0;

    const tick = async () => {
      const stocks = inZoneListFiltered.filter((it) => it.scope === "stock");
      if (stocks.length === 0 || cancelled) return;

      const activeSym =
        inZoneActive?.scope === "stock" ? inZoneActive.symbol : null;
      const stale = stocks.filter((it) => isSlideshowZoneStale(it.data?.computedAt));
      if (stale.length === 0) return;

      const ordered = [...stale].sort((a, b) => {
        if (a.symbol === activeSym) return -1;
        if (b.symbol === activeSym) return 1;
        return 0;
      });
      const pick = ordered[roundRobin % ordered.length];
      roundRobin += 1;
      if (!pick || cancelled) return;

      await refreshOneSlideshowStockZone(
        pick.symbol,
        pick.symbol === activeSym,
      );
    };

    void tick();
    const id = setInterval(() => void tick(), SLIDESHOW_ZONE_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    viewMode,
    inZoneListFiltered,
    inZoneActive?.scope,
    inZoneActive?.symbol,
    refreshOneSlideshowStockZone,
  ]);

  const openBubbleChart = useCallback((item: { scope: "index" | "stock"; symbol: string }) => {
    const url = levelsChartPagePathForHost(
      window.location.hostname,
      item.scope,
      item.symbol,
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const inZoneEntries: LevelsListEntry[] = useMemo(
    () =>
      inZoneListFiltered.map((it) => {
        const id = `${it.scope}-${it.symbol}`;
        const bands = bandsFromLevels(it.data, it.spot);
        return {
          id,
          label: it.label,
          sublabel: it.scope === "index" ? "Index" : "Stock",
          spot: liveStripSpot[id] ?? it.spot,
          currency: it.currency,
          trailing: <StatusBadge bands={bands} />,
        };
      }),
    [inZoneListFiltered, liveStripSpot],
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
        onLastCloseChange={activeTv?.nativeCandles ? handleChartLastClose : undefined}
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

  const chartHighConfidence =
    inZoneActive?.scope === "index" || isHighConfidenceLevels(activeChartLevels);

  const slideshowChartChrome =
    activeTv != null && activeTicker ? (
      <LevelsChartChrome
        symbol={activeTicker}
        subtitle={slideshowSubtitleLine}
        config={activeTv}
        nativeChartRef={nativeChartRef}
        chartFullHistory={chartFullHistory}
        hideToolbar
        highConfidence={chartHighConfidence}
        badge={
          <VolRegimeBadge
            flag={activeChartLevels?.volRegime}
            reason={activeChartLevels?.volRegimeReason}
            atmIV={activeChartLevels?.atmIV}
            daysToEarnings={activeChartLevels?.daysToEarnings}
          />
        }
      />
    ) : null;

  const slideshowSymbolStrip =
    viewMode === "slideshow" && inZoneCount > 0 ? (
      <LevelsSymbolList
        entries={inZoneEntries}
        activeIndex={inZoneCurrent}
        onSelect={setInZoneSlide}
        layout="horizontal"
        runnerMode
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
        hideLevelsColumn={opts?.hideLevelsColumn ?? slideshowNativeLayout}
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
      const filteredEmpty =
        slideshowFilter !== "all" && slideshowFilterCounts.all > 0;
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
    const zonesUpdatedLabel = zonesUpdatedFooterLabel(inZoneChartData?.computedAt);
    return wrapSlideshowBody(
      slideshowNativeLayout ? (
        <></>
      ) : (
        <LevelsSymbolList
          entries={inZoneEntries}
          activeIndex={inZoneCurrent}
          onSelect={setInZoneSlide}
          layout="responsive"
        />
      ),
      slideshowNativeLayout ? (
        <></>
      ) : inZoneActive ? (
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
          zonesUpdatedLabel={zonesUpdatedLabel}
          slideshowAdvanceHint
          slideshowPaused={slideshowPaused}
          showCarouselArrows={false}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center" style={{ color: "#64748b" }}>
          <p className="text-xs">No selection</p>
        </div>
      ),
      slideshowNativeLayout
        ? {
            hideLevelsColumn: true,
            news: slideshowNews,
            listAboveChart: true,
            chartFooter: (
              <LevelsChartMetaFooter
                slideCount={inZoneCount}
                activeIndex={inZoneCurrent}
                onGoTo={setInZoneSlide}
                zonesUpdatedLabel={zonesUpdatedLabel}
                slideshowAdvanceHint
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
                bubblesMode={viewMode === "bubbles"}
                bubbleSearch={bubbleSearch}
                onBubbleSearchChange={(value) => {
                  setBubbleSearch(value);
                  setInZoneSlide(0);
                }}
                bubbleMapFilter={bubbleMapFilter}
                onBubbleMapFilterChange={setBubbleMapFilter}
                bubbleFilterCounts={bubbleFilterCounts}
                slideshowFilter={slideshowFilter}
                onSlideshowFilterChange={(filter) => {
                  setSlideshowFilter(filter);
                  setInZoneSlide(0);
                }}
                slideshowFilterCounts={slideshowFilterCounts}
                filtersOnly={viewMode === "slideshow"}
                symbolStrip={viewMode === "slideshow" ? slideshowSymbolStrip : undefined}
                slideshowControl={
                  viewMode === "slideshow" && slideshowEnabled
                    ? {
                        enabled: true,
                        paused: slideshowPaused,
                        onToggle: toggleSlideshowPause,
                        secondsRemaining: slideshowCountdown,
                      }
                    : undefined
                }
                viewModeToggle={
                  viewMode === "slideshow"
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
                  toneFilter={bubbleMapFilter}
                  searchQuery={bubbleSearch}
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
