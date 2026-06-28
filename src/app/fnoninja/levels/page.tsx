"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react";
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
import { LevelsChartExpiryPicker } from "@/components/levels/LevelsChartExpiryPicker";
import {
  LevelsOutlookViewToggle,
  type LevelsViewMode as ChartPanelViewMode,
} from "@/components/levels/LevelsOutlookViewToggle";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import { OiHistoryChart } from "@/components/levels/OiHistoryChart";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import { useChartOutlookKeyboardShortcuts } from "@/lib/levels/use-chart-outlook-keyboard";
import { useIndexExpirySelection } from "@/lib/levels/use-index-expiry-selection";
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
import {
  FNO_LEVELS_MAIN,
  FNO_LEVELS_SHELL,
  FNO_MOBILE_SLIDE_BODY_MIN_CLASS,
} from "@/lib/fnoninja/responsive";
import { FNO_APP_SURFACE_STYLE, FNO_MUTED } from "@/lib/fnoninja/theme";
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
import { FnoNinjaFavslideToggle } from "@/components/fnoninja/FnoNinjaFavslideToggle";
import { AskFynn } from "@/components/fnoninja/AskFynn";
import { LevelsSymbolShareButton } from "@/components/levels/LevelsSymbolShareButton";
import { LevelsMarketMapShareButton } from "@/components/levels/LevelsMarketMapShareButton";
import { FnoNinjaFavslideAddButton } from "@/components/fnoninja/FnoNinjaFavslideAddButton";
import { FnoNinjaChartLoginGate } from "@/components/fnoninja/FnoNinjaChartLoginGate";
import { FnoNinjaLiveslideWalkthroughBridge } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughBridge";
import { useLiveslideWalkthroughOptional } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";
import { useFnoNinjaFavslide, type FnoNinjaFavslideApi } from "@/hooks/useFnoNinjaFavslide";
import { useUser } from "@/firebase";

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
  oi?: PublicLevels["oi"];
}

type InZoneItem = LevelsActionableItem;

interface LevelsPayload {
  indices: RawItem[];
  stocks: StockListItem[];
  inZone: InZoneItem[];
  fnoUniverse?: string[];
  updatedAt: string;
}

type LevelsViewMode = "bubbles" | "liveslide" | "favslide";

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
  const [fynnDrawerOpen, setFynnDrawerOpen] = useState(false);
  const [slideshowCountdown, setSlideshowCountdown] = useState(SLIDESHOW_SLIDE_SECONDS);
  const [bubbleMapFilter, setBubbleMapFilter] = useState<BubbleMapFilter>("all");
  const [slideshowFilter, setSlideshowFilter] = useState<SlideshowMapFilter>("all");
  const [chartFullHistory, setChartFullHistory] = useState(false);
  const [slideshowChartViewMode, setSlideshowChartViewMode] = useState<ChartPanelViewMode>("chart");
  /** Last candle close per symbol — strip tiles match native chart price. */
  const [liveStripSpot, setLiveStripSpot] = useState<Record<string, number>>({});
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);
  const activeStripKeyRef = useRef("");
  const chartLevelsSymbolRef = useRef<string | null>(null);
  const isFnoNinjaHost = true;
  const {
    entries: favslideEntries,
    loading: favslideLoading,
    isSignedIn: favslideSignedIn,
    refresh: refreshFavslide,
    setFavorite: setFavslideFavorite,
    toggle: toggleFavslideFavorite,
    isFavorite: isFavslideFavorite,
    mutating: favslideMutating,
  } = useFnoNinjaFavslide(isFnoNinjaHost);

  const favslideApi = useMemo(
    (): FnoNinjaFavslideApi => ({
      isFavorite: isFavslideFavorite,
      setFavorite: setFavslideFavorite,
      toggle: toggleFavslideFavorite,
      loading: favslideLoading,
      mutating: favslideMutating,
    }),
    [
      isFavslideFavorite,
      setFavslideFavorite,
      toggleFavslideFavorite,
      favslideLoading,
      favslideMutating,
    ],
  );

  const isSlideView = viewMode === "liveslide" || viewMode === "favslide";
  const slideSignInGate = isSlideView;

  useEffect(() => {
    if (!isSlideView) setFynnDrawerOpen(false);
  }, [isSlideView]);
  const { user: slideAuthUser, isUserLoading: slideAuthLoading } = useUser();

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
    const mq = window.matchMedia("(min-width: 768px)");

    const apply = () => {
      if (mq.matches) {
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
      } else {
        html.style.overflow = prevHtml;
        body.style.overflow = prevBody;
      }
    };

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const enterLiveslide = useCallback(() => {
    setViewMode("liveslide");
    setInZoneSlide(0);
  }, []);

  const enterFavslide = useCallback(() => {
    if (!isFnoNinjaHost) return;
    void refreshFavslide();
    setViewMode("favslide");
    setInZoneSlide(0);
  }, [isFnoNinjaHost, refreshFavslide]);

  const enterBubbles = useCallback(() => {
    setViewMode("bubbles");
  }, []);

  const walkthrough = useLiveslideWalkthroughOptional();
  const registerLevelsViewMode = walkthrough?.registerLevelsViewMode;

  useEffect(() => {
    if (!isFnoNinjaHost || !registerLevelsViewMode) return;
    registerLevelsViewMode(viewMode);
  }, [isFnoNinjaHost, registerLevelsViewMode, viewMode]);

  const prepareSlideshowWalkthrough = useCallback(() => {
    if (viewMode === "favslide") {
      enterFavslide();
    } else {
      enterLiveslide();
    }
    setSlideshowPaused(true);
  }, [viewMode, enterFavslide, enterLiveslide]);

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
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        enterLiveslide();
        return;
      }
      if ((e.key === "f" || e.key === "F") && isFnoNinjaHost) {
        e.preventDefault();
        enterFavslide();
        return;
      }
      if (e.key === "b" || e.key === "B") {
        if (viewMode !== "bubbles") {
          e.preventDefault();
          enterBubbles();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterLiveslide, enterFavslide, enterBubbles, isFnoNinjaHost, viewMode]);

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

  const indexBySymbol = useMemo(() => {
    const m = new Map<string, RawItem>();
    for (const idx of payload?.indices ?? []) {
      const sym = idx.symbol?.trim().toUpperCase() ?? idx.label.trim().toUpperCase();
      if (sym) m.set(sym, idx);
    }
    return m;
  }, [payload?.indices]);

  /** Full F&O map — zone tones gated by 2:1 POC RR (bubble + slideshow). */
  const bubbleItems = useMemo(
    () =>
      payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol, payload.fnoUniverse) : [],
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
    return bubbleItems
      .filter((it) => slideshowMatchesMapFilter(it.tone, slideshowFilter))
      .map((it) => bubbleItemToActionable(it, stockBySymbol))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [bubbleItems, slideshowFilter, stockBySymbol]);

  const favslideListFiltered = useMemo((): LevelsActionableItem[] => {
    return favslideEntries.map((entry) => {
      if (entry.scope === "index") {
        const idx = indexBySymbol.get(entry.symbol);
        const data = idx?.data ?? null;
        const spot = data?.spot ?? null;
        return {
          scope: "index" as const,
          symbol: entry.symbol,
          label: idx?.label ?? entry.symbol,
          status: deriveZoneStatus(bandsFromLevels(data, spot)),
          spot,
          currency: "₹" as const,
          data,
        };
      }
      const row = stockBySymbol.get(entry.symbol);
      if (!row) {
        return {
          scope: "stock" as const,
          symbol: entry.symbol,
          label: entry.symbol,
          status: "NEUTRAL" as ZoneStatus,
          spot: null,
          currency: "₹" as const,
          data: null,
        };
      }
      const data = levelsFromStockRow(row);
      return {
        scope: "stock" as const,
        symbol: entry.symbol,
        label: row.label ?? entry.symbol,
        status: deriveZoneStatus(bandsFromLevels(data, row.spot)),
        spot: row.spot,
        currency: "₹" as const,
        data,
      };
    });
  }, [favslideEntries, stockBySymbol, indexBySymbol]);

  const slideListFiltered =
    viewMode === "favslide" ? favslideListFiltered : inZoneListFiltered;

  const inZoneCount = slideListFiltered.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? slideListFiltered[inZoneCurrent] : null;

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

  const slideshowEnabled = isSlideView && inZoneCount > 1;
  /** Favslide: keep transport + pill row even when empty; liveslide needs 2+ symbols to advance. */
  const showSlideshowStripTransport =
    isSlideView && (viewMode === "favslide" || inZoneCount > 1);

  const toggleSlideshowPause = useCallback(() => {
    setSlideshowPaused((p) => {
      if (p) setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
      return !p;
    });
  }, []);

  const scheduleNote = "Updates Mon–Fri during market hours";

  const activeTv = useMemo(() => {
    if (!isSlideView || !inZoneActive) return null;
    return levelsTradingViewParams(inZoneActive.scope, inZoneActive.symbol);
  }, [viewMode, inZoneActive]);

  const activeChartLevels = useMemo<PublicLevels | null>(() => {
    if (!isSlideView || !inZoneActive) return null;
    return inZoneChartData;
  }, [viewMode, inZoneActive, inZoneChartData]);

  const expiryScope =
    inZoneActive?.scope === "index" || inZoneActive?.scope === "stock"
      ? inZoneActive.scope
      : null;
  const {
    selectedExpiryKey,
    setSelectedExpiryKey,
    displayLevels: expiryDisplayLevels,
    expiryOptions,
  } = useIndexExpirySelection(activeChartLevels, expiryScope);

  const chartLevelsForView = expiryScope ? expiryDisplayLevels : activeChartLevels;
  const expiryPickerEnabled = expiryOptions && expiryOptions.length > 1;
  const showSlideshowOutlook = isSlideView && slideshowChartViewMode === "outlook";
  const showSlideshowHistory =
    isSlideView &&
    slideshowChartViewMode === "history" &&
    (inZoneActive?.scope === "index" || inZoneActive?.scope === "stock");

  useChartOutlookKeyboardShortcuts(
    true,
    () => setSlideshowChartViewMode("chart"),
    () => setSlideshowChartViewMode("outlook"),
    isSlideView && !fynnDrawerOpen,
    { historyAvailable: true, onHistory: () => setSlideshowChartViewMode("history") },
  );

  /** Chart + news rail — stable for all native-candle slideshow symbols (not gated on levels load). */
  const slideshowNativeLayout = Boolean(
    isSlideView && activeTv?.nativeCandles && inZoneActive != null,
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
    isSlideView &&
    inZoneChartLoading &&
    (inZoneActive?.scope === "stock" || inZoneActive?.scope === "index") &&
    !levelsHaveBands(inZoneChartData);

  const slideshowChartShortcuts =
    isSlideView && activeTv
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
    setChartFullHistory(isSlideView);
    setSlideshowChartViewMode("chart");
  }, [activeTv?.symbol, activeTv?.exchange, activeTv?.candlesScope, viewMode]);

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  useEffect(() => {
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [inZoneCurrent, slideshowFilter, viewMode]);

  useEffect(() => {
    if (slideshowPaused || fynnDrawerOpen || !isSlideView || inZoneCount <= 1) return;
    const id = setInterval(() => {
      setSlideshowCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [slideshowPaused, fynnDrawerOpen, viewMode, inZoneCount, inZoneCurrent, slideshowFilter]);

  useEffect(() => {
    if (slideshowCountdown > 0) return;
    if (slideshowPaused || fynnDrawerOpen || !isSlideView || inZoneCount <= 1) return;
    setInZoneSlide((s) => (s + 1) % inZoneCount);
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [slideshowCountdown, slideshowPaused, fynnDrawerOpen, viewMode, inZoneCount]);

  useEffect(() => {
    if (inZoneCount === 0) setInZoneSlide(0);
    else if (inZoneSlide >= inZoneCount) setInZoneSlide(0);
  }, [inZoneCount, inZoneSlide]);

  const refreshOneSlideshowSymbolZone = useCallback(
    async (
      scope: "index" | "stock",
      symbol: string,
      updateActiveChart: boolean,
    ) => {
      try {
        const json = await fetchSymbolLevels(scope, symbol, { slideshow: true });
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
    /** Liveslide/favslide: per-symbol API for full expiry slices (picker + Outlook). */
    const slideshowSymbolNeedsApi =
      isSlideView &&
      (inZoneActive.scope === "stock" || inZoneActive.scope === "index");

    if (hasBands && !slideshowSymbolNeedsApi) {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    if (!slideshowSymbolNeedsApi) {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    let cancelled = false;
    setInZoneChartLoading(true);
    if (symbolChanged) {
      setInZoneChartData(null);
    }
    void fetchSymbolLevels(inZoneActive.scope, inZoneActive.symbol, { slideshow: true })
      .then((json) => {
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

  /** Keep slideshow symbols on a ≤5m zone refresh cadence (one symbol per tick). */
  useEffect(() => {
    if (!isSlideView) return;

    let cancelled = false;
    let roundRobin = 0;

    const tick = async () => {
      const symbols = slideListFiltered.filter(
        (it) => it.scope === "stock" || it.scope === "index",
      );
      if (symbols.length === 0 || cancelled) return;

      const activeKey =
        inZoneActive?.scope === "stock" || inZoneActive?.scope === "index"
          ? inZoneActive.symbol
          : null;
      const stale = symbols.filter((it) => isSlideshowZoneStale(it.data?.computedAt));
      if (stale.length === 0) return;

      const ordered = [...stale].sort((a, b) => {
        if (a.symbol === activeKey) return -1;
        if (b.symbol === activeKey) return 1;
        return 0;
      });
      const pick = ordered[roundRobin % ordered.length];
      roundRobin += 1;
      if (!pick || cancelled) return;

      await refreshOneSlideshowSymbolZone(
        pick.scope,
        pick.symbol,
        pick.symbol === activeKey,
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
    slideListFiltered,
    inZoneActive?.scope,
    inZoneActive?.symbol,
    refreshOneSlideshowSymbolZone,
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
      slideListFiltered.map((it) => {
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
    [slideListFiltered, liveStripSpot],
  );

  const tvChartColumn =
    activeTv != null ? (
      <div
        data-liveslide-tour="chart"
        data-favslide-tour="chart"
        className="flex flex-1 min-h-0 h-full w-full flex-col max-md:touch-pan-y"
      >
        {isSlideView ? (
          <LevelsOutlookViewToggle
            value={slideshowChartViewMode}
            onChange={setSlideshowChartViewMode}
          />
        ) : null}
        {showSlideshowHistory && inZoneActive ? (
          <OiHistoryChart
            className="flex-1 min-h-0 h-full w-full"
            scope={inZoneActive.scope}
            symbol={inZoneActive.symbol}
          />
        ) : showSlideshowOutlook ? (
          <NiftyOutlookChart
            className="flex-1 min-h-0 h-full w-full"
            levels={activeChartLevels}
            spot={chartLevelsForView?.spot ?? activeChartLevels?.spot ?? null}
          />
        ) : (
          <LevelsTradingViewChart
            className="flex-1 min-h-0 h-full w-full"
            config={activeTv}
            ticker={activeTicker ?? activeTv.symbol}
            companyName={activeCompanyName ?? undefined}
            levels={chartLevelsForView}
            loading={chartLevelsLoading}
            showSlideshowControl={slideshowEnabled}
            slideshowPaused={slideshowPaused}
            onToggleSlideshowPause={toggleSlideshowPause}
            hideChartShortcuts={isSlideView}
            defaultFullHistory={isSlideView}
            showHeader={!isSlideView}
            nativeChartRef={nativeChartRef}
            onFullHistoryZoomChange={setChartFullHistory}
            onLastCloseChange={activeTv?.nativeCandles ? handleChartLastClose : undefined}
          />
        )}
      </div>
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
      <div
        data-liveslide-tour="news"
        data-favslide-tour="news"
        className="h-full min-h-0 max-md:h-auto max-md:min-h-[min(44dvh,400px)]"
      >
        <LevelsNewsPanel
          scope={inZoneActive.scope}
          symbol={activeTicker}
          className="h-full max-md:h-auto"
        />
      </div>
    ) : null;

  const viewToggleLabel =
    viewMode === "bubbles" ? "View Liveslide" : "View Bubbles map";
  const bubblesBackTitle = "Back to Market Bubbles map. Press B or click.";
  const liveslideCtaTitle = "Cycle aligned market setups. Press L or click.";
  const favslideCtaTitle = "Cycle your favourited stocks. Press F or click.";

  const chartHighConfidence =
    inZoneActive?.scope === "index" || isHighConfidenceLevels(chartLevelsForView);

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
            flag={chartLevelsForView?.volRegime}
            reason={chartLevelsForView?.volRegimeReason}
            atmIV={chartLevelsForView?.atmIV}
            daysToEarnings={chartLevelsForView?.daysToEarnings}
          />
        }
        expiryPicker={
          expiryPickerEnabled ? (
            <LevelsChartExpiryPicker
              options={expiryOptions}
              value={selectedExpiryKey}
              onChange={setSelectedExpiryKey}
            />
          ) : undefined
        }
        headerTrailing={
          isFnoNinjaHost && isSlideView && inZoneActive && activeTicker ? (
            <div className="flex flex-wrap items-center gap-1.5 justify-end">
              <LevelsSymbolShareButton
                scope={inZoneActive.scope}
                symbol={activeTicker}
                label={slideshowSubtitleLine ?? inZoneActive.label}
                levels={chartLevelsForView}
                expiryKey={expiryScope ? selectedExpiryKey : null}
                nativeChartRef={nativeChartRef}
                iconOnly
              />
              <AskFynn
                scope={inZoneActive.scope}
                symbol={activeTicker}
                label={slideshowSubtitleLine ?? inZoneActive.label}
                iconOnly
                onOpenChange={setFynnDrawerOpen}
              />
              <FnoNinjaFavslideToggle
                scope={inZoneActive.scope}
                symbol={activeTicker}
                enabled
                iconOnly
                removeOnly={viewMode === "favslide"}
                api={favslideApi}
              />
            </div>
          ) : undefined
        }
      />
    ) : null;

  const slideshowSymbolStrip =
    isSlideView && inZoneCount > 0 ? (
      <LevelsSymbolList
        entries={inZoneEntries}
        activeIndex={inZoneCurrent}
        onSelect={setInZoneSlide}
        layout="horizontal"
        runnerMode
        stripAccent={viewMode === "favslide" ? "favslide" : "liveslide"}
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
    <div className={`flex flex-col w-full min-w-0 md:flex-1 md:min-h-0 md:overflow-hidden max-md:pb-4 ${isSlideView ? FNO_MOBILE_SLIDE_BODY_MIN_CLASS : ""}`}>
      <LevelsTripleColumnShell
        list={opts?.listAboveChart ? <></> : list}
        levels={levels}
        news={opts?.news}
        hideLevelsColumn={opts?.hideLevelsColumn ?? slideshowNativeLayout}
        listAboveChart={opts?.listAboveChart}
        chartChrome={opts?.listAboveChart ? slideshowChartChrome : undefined}
        chart={
          <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-md:touch-pan-y">
            <div className="flex flex-1 min-h-0 min-w-0 w-full flex-col">{tvChartColumn}</div>
            {opts?.chartFooter ? (
              <div className="shrink-0 min-w-0 max-md:pb-1">{opts.chartFooter}</div>
            ) : null}
          </div>
        }
      />
      <LevelsDisclaimer scheduleNote={scheduleNote} />
    </div>
  );

  const renderSlideshow = () => {
    if (inZoneCount === 0) {
      if (viewMode === "favslide") {
        return (
          <div
            className={`flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:pb-4 ${FNO_MOBILE_SLIDE_BODY_MIN_CLASS}`}
          >
            <div className="flex flex-1 min-h-0 w-full items-center justify-center px-6 text-center">
              {favslideLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
                  <p className="text-sm" style={{ color: FNO_MUTED }}>
                    Loading favslide…
                  </p>
                </div>
              ) : (
                <div className="max-w-md space-y-3">
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Your personal favslide
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
                    A private slideshow of the names you follow — charts, levels, and news, one pick at
                    a time.
                  </p>
                  <p className="text-xs leading-relaxed max-w-sm mx-auto" style={{ color: "#64748b" }}>
                    Tap{" "}
                    <span className="font-semibold" style={{ color: "#fbbf24" }}>
                      Add
                    </span>{" "}
                    above to search and save F&amp;O symbols or indices. You can also star any chart from
                    the map.
                  </p>
                </div>
              )}
            </div>
            <LevelsDisclaimer scheduleNote={scheduleNote} />
          </div>
        );
      }

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

    const chartSpot = chartLevelsForView?.spot ?? inZoneActive?.spot ?? null;
    const zonesUpdatedLabel = zonesUpdatedFooterLabel(chartLevelsForView?.computedAt);
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
          levels={chartLevelsForView}
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
              <div data-liveslide-tour="footer" data-favslide-tour="footer">
                <LevelsChartMetaFooter
                  slideCount={inZoneCount}
                  activeIndex={inZoneCurrent}
                  onGoTo={setInZoneSlide}
                  zonesUpdatedLabel={zonesUpdatedLabel}
                  slideshowAdvanceHint
                  slideshowPaused={slideshowPaused}
                />
              </div>
            ),
          }
        : undefined,
    );
  };

  const levelsSlideshowToolbar = (
    <LevelsSlideshowToolbar
      bubblesMode={viewMode === "bubbles"}
      bubbleMapFilter={bubbleMapFilter}
      onBubbleMapFilterChange={setBubbleMapFilter}
      bubbleFilterCounts={bubbleFilterCounts}
      slideshowFilter={viewMode === "liveslide" ? slideshowFilter : undefined}
      onSlideshowFilterChange={
        viewMode === "liveslide"
          ? (filter) => {
              setSlideshowFilter(filter);
              setInZoneSlide(0);
            }
          : undefined
      }
      slideshowFilterCounts={viewMode === "liveslide" ? slideshowFilterCounts : undefined}
      filtersOnly={isSlideView}
      symbolStrip={
        isSlideView && slideshowSymbolStrip ? (
          <div
            data-liveslide-tour="strip"
            data-favslide-tour="strip"
            className="h-full w-full min-w-0"
          >
            {slideshowSymbolStrip}
          </div>
        ) : undefined
      }
      slideshowControl={
        showSlideshowStripTransport
          ? {
              enabled: true,
              paused: inZoneCount <= 1 || slideshowPaused,
              onToggle:
                inZoneCount > 1 ? toggleSlideshowPause : () => {},
              secondsRemaining: slideshowCountdown,
            }
          : undefined
      }
      slideModePill={
        isSlideView
          ? {
              mode: viewMode,
              count: slideListFiltered.length,
            }
          : undefined
      }
      viewSwitchGroup={
        isSlideView
          ? {
              currentMode: viewMode === "favslide" ? "favslide" : "liveslide",
              onBubbles: enterBubbles,
              bubblesTitle: bubblesBackTitle,
              ...(isFnoNinjaHost
                ? viewMode === "favslide"
                  ? {
                      alternateMode: "liveslide" as const,
                      onAlternate: enterLiveslide,
                      alternateTitle: liveslideCtaTitle,
                    }
                  : {
                      alternateMode: "favslide" as const,
                      onAlternate: enterFavslide,
                      alternateTitle: favslideCtaTitle,
                    }
                : {}),
            }
          : undefined
      }
      stripTrailing={
        viewMode === "favslide" && isFnoNinjaHost ? (
          <FnoNinjaFavslideAddButton
            api={favslideApi}
            needsSignIn={!favslideSignedIn}
            onAdded={() => {
              setInZoneSlide(favslideEntries.length);
            }}
          />
        ) : undefined
      }
      chartShortcuts={isSlideView && !activeTv ? slideshowChartShortcuts : null}
      favslideToggle={
        isFnoNinjaHost
          ? {
              label: "View favslide",
              shortLabel: "Favslide",
              onClick: enterFavslide,
              title: favslideCtaTitle,
              variant: "favslide" as const,
              kbd: "F",
              active: viewMode === "favslide",
            }
          : undefined
      }
      viewToggle={{
        label: viewToggleLabel,
        shortLabel: viewMode === "bubbles" ? "Liveslide" : "Bubbles",
        onClick: viewMode === "bubbles" ? enterLiveslide : enterBubbles,
        title: viewMode === "bubbles" ? liveslideCtaTitle : bubblesBackTitle,
        variant: "liveslide" as const,
        kbd: viewMode === "bubbles" ? "L" : "B",
        active: viewMode === "liveslide",
      }}
      shareTrailing={
        isFnoNinjaHost && viewMode === "bubbles" ? (
          <LevelsMarketMapShareButton viewLabel="Market Bubbles" iconOnly />
        ) : undefined
      }
    />
  );

  const levelsMainPane =
    viewMode === "bubbles" ? (
      <LevelsBubblesView
        items={bubbleItems}
        onBubbleOpen={openBubbleChart}
        hasMarketData={Boolean(payload)}
        toneFilter={bubbleMapFilter}
      />
    ) : (
      renderSlideshow()
    );

  const levelsWorkspace = (
    <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:flex-none max-md:overflow-visible md:overflow-hidden">
      <div className="shrink-0">{levelsSlideshowToolbar}</div>
      <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:flex-none max-md:overflow-visible md:overflow-hidden">
        {levelsMainPane}
      </div>
    </div>
  );

  return (
    <main className={`${FNO_LEVELS_MAIN} min-w-0`} style={FNO_APP_SURFACE_STYLE}>
      <Suspense fallback={null}>
        <FnoNinjaLiveslideWalkthroughBridge onPrepare={prepareSlideshowWalkthrough} />
      </Suspense>
      <div
        className={`${FNO_LEVELS_SHELL} flex-1 min-h-0 flex flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden`}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : slideSignInGate && !slideAuthUser ? (
          <FnoNinjaChartLoginGate
            overlay
            backAction={{ label: "Back to Market Map", onClick: enterBubbles }}
          >
            {levelsWorkspace}
          </FnoNinjaChartLoginGate>
        ) : slideSignInGate && slideAuthLoading ? (
          <div
            className={`flex flex-1 min-h-0 w-full flex-col items-center justify-center ${FNO_MOBILE_SLIDE_BODY_MIN_CLASS}`}
          >
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : (
          levelsWorkspace
        )}
      </div>
    </main>
  );
}
