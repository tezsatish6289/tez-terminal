"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { LevelsChartDeepDiveLayout } from "@/components/levels/LevelsChartDeepDiveLayout";
import { LevelsChartSideToolbar } from "@/components/levels/LevelsChartSideToolbar";
import { LevelsChartExpiryPicker } from "@/components/levels/LevelsChartExpiryPicker";
import {
  LevelsOutlookViewToggle,
  type LevelsViewMode as ChartPanelViewMode,
} from "@/components/levels/LevelsOutlookViewToggle";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import { OiHistoryChart } from "@/components/levels/OiHistoryChart";
import { PvtChart } from "@/components/levels/PvtChart";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import {
  getSlideshowLevelsCache,
  prefetchSlideshowLevels,
  primeSlideshowLevelsCache,
} from "@/lib/levels/slideshow-levels-cache";
import { useChartOutlookKeyboardShortcuts } from "@/lib/levels/use-chart-outlook-keyboard";
import { useTradingViewChartShortcut } from "@/lib/levels/use-tradingview-chart-shortcut";
import { useIndexExpirySelection } from "@/lib/levels/use-index-expiry-selection";
import { LevelsSymbolStatusBadge } from "@/components/levels/LevelsSymbolStatusBadge";
import type { LevelsChartStatusOverlayProps } from "@/components/levels/LevelsChartCornerStatusBlobs";
import { LevelsSlideshowToolbar } from "@/components/levels/LevelsSlideshowToolbar";
import { LevelsSlideshowStripControls } from "@/components/levels/LevelsSlideshowStripControls";
import {
  LevelsSlideshowSymbolRailDesktop,
  LevelsSlideshowSymbolRailMobile,
} from "@/components/levels/LevelsSlideshowSymbolRail";
import { SlideshowAutoPauseBanner, isSlideshowOverlayPause } from "@/components/levels/SlideshowAutoPauseBanner";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
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
  type ZoneStatus,
} from "@/lib/zones/zone-status";
import type { BubbleTone } from "@/lib/zones/bubble-tone";
import { applyConfirmedSignal, withoutConfirmedSignalTone } from "@/lib/zones/bubble-tone";
import { resolveSymbolDisplayTone } from "@/lib/zones/symbol-display-tone";
import type { ConfirmedSignal } from "@/lib/levels/confirmed-signal-core";
import type { LevelsBubbleItem } from "@/components/levels/LevelsBubblesView";
import { FnoNinjaFavslideAddButton } from "@/components/fnoninja/FnoNinjaFavslideAddButton";
import { FnoNinjaChartLoginGate, FnoNinjaMarketMapGuestGate } from "@/components/fnoninja/FnoNinjaChartLoginGate";
import { LevelsViewUrlSync } from "@/components/levels/LevelsViewUrlSync";
import { FnoNinjaLiveslideWalkthroughBridge } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughBridge";
import { useLiveslideWalkthroughOptional } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";
import { useFnoNinjaFavslide, type FnoNinjaFavslideApi } from "@/hooks/useFnoNinjaFavslide";
import { useUser } from "@/firebase";
import { bypassFnoNinjaSlideAuthForLocalDev } from "@/lib/fnoninja/auth";
import { pickGuestPreviewBubbleIds } from "@/lib/fnoninja/guest-map-preview";

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
  signals?: Record<string, "bullish" | "bearish">;
  fnoUniverse?: string[];
  updatedAt: string;
}

type LevelsViewMode = "bubbles" | "liveslide" | "favslide";

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

function slideshowExplorePauseReason(
  chartViewMode: ChartPanelViewMode,
  atlasOpen: boolean,
  newsOpen: boolean,
  chatOpen: boolean,
): string | null {
  if (atlasOpen) return "Atlas";
  if (newsOpen) return "News";
  if (chatOpen) return "Chat";
  if (chartViewMode === "chart") return "Intraday";
  if (chartViewMode === "outlook") return "Outlook";
  if (chartViewMode === "history") return "History";
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
  const [newsDrawerOpen, setNewsDrawerOpen] = useState(false);
  const { open: chatDrawerOpen } = useChatPanel();
  const [slideshowCountdown, setSlideshowCountdown] = useState(SLIDESHOW_SLIDE_SECONDS);
  const [bubbleMapFilter, setBubbleMapFilter] = useState<BubbleMapFilter>("all");
  const [showMaxPainBubbles, setShowMaxPainBubbles] = useState(false);
  const [slideshowFilter, setSlideshowFilter] = useState<SlideshowMapFilter>("all");
  const [chartFullHistory, setChartFullHistory] = useState(false);
  const [slideshowChartViewMode, setSlideshowChartViewMode] = useState<ChartPanelViewMode>("pvt");
  /** Last candle close per symbol — strip tiles match native chart price. */
  const [liveStripSpot, setLiveStripSpot] = useState<Record<string, number>>({});
  /**
   * Live PVT signal per symbol reported by the trend chart. Lets the chip badge
   * mirror exactly what the chart shows (fixes bull/bear chip vs neutral chart).
   */
  const [liveSignalOverride, setLiveSignalOverride] = useState<
    Record<string, ConfirmedSignal | null>
  >({});
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
  const [localDevSlideBypass, setLocalDevSlideBypass] = useState(false);
  useEffect(() => {
    setLocalDevSlideBypass(bypassFnoNinjaSlideAuthForLocalDev());
  }, []);
  const levelsSignInGate = !localDevSlideBypass;

  useEffect(() => {
    if (!isSlideView) {
      setFynnDrawerOpen(false);
      setNewsDrawerOpen(false);
    }
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
      payload
        ? buildLevelsBubbleItems(
            payload.indices,
            stockBySymbol,
            payload.fnoUniverse,
            payload.signals,
          )
        : [],
    [payload, stockBySymbol],
  );

  const bubbleFilterCounts = useMemo(
    () => countBubbleMapFilters(bubbleItems),
    [bubbleItems],
  );

  const bubbleToneByKey = useMemo(() => {
    const m = new Map<string, BubbleTone>();
    for (const it of bubbleItems) m.set(it.id, it.tone);
    return m;
  }, [bubbleItems]);

  const slideshowFilterCounts = useMemo(
    () => countSlideshowMapFilters(bubbleItems),
    [bubbleItems],
  );

  /** Slideshow strip — confirmed signals + zone setups (at/near support/resistance). */
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

  const handleLiveSignal = useCallback(
    (scope: "index" | "stock", symbol: string, signal: ConfirmedSignal | null) => {
      const key = `${scope}-${symbol}`;
      setLiveSignalOverride((prev) => (prev[key] === signal ? prev : { ...prev, [key]: signal }));
    },
    [],
  );

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

  const slideshowExploreHold = useMemo(
    () =>
      isSlideView
        ? slideshowExplorePauseReason(
            slideshowChartViewMode,
            fynnDrawerOpen,
            newsDrawerOpen,
            chatDrawerOpen,
          )
        : null,
    [isSlideView, slideshowChartViewMode, fynnDrawerOpen, newsDrawerOpen, chatDrawerOpen],
  );

  const slideshowTimerPaused = slideshowPaused || Boolean(slideshowExploreHold);

  const handleSlideshowTransportClick = useCallback(() => {
    if (inZoneCount <= 1) return;
    if (isSlideshowOverlayPause(slideshowExploreHold)) return;
    if (slideshowExploreHold) {
      setSlideshowChartViewMode("pvt");
      setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
      return;
    }
    toggleSlideshowPause();
  }, [inZoneCount, slideshowExploreHold, toggleSlideshowPause]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key !== "p" && e.key !== "P") return;
      if (!showSlideshowStripTransport || inZoneCount <= 1) return;
      e.preventDefault();
      handleSlideshowTransportClick();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSlideshowStripTransport, inZoneCount, handleSlideshowTransportClick]);

  const handleSlideshowChartViewChange = useCallback((mode: ChartPanelViewMode) => {
    setSlideshowChartViewMode(mode);
  }, []);

  const handleFynnDrawerOpenChange = useCallback((open: boolean) => {
    setFynnDrawerOpen(open);
  }, []);

  const handleNewsDrawerOpenChange = useCallback((open: boolean) => {
    setNewsDrawerOpen(open);
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
  const showChartExpiryPicker =
    expiryPickerEnabled &&
    (slideshowChartViewMode === "pvt" || slideshowChartViewMode === "chart");
  const showSlideshowOutlook = isSlideView && slideshowChartViewMode === "outlook";
  const showSlideshowHistory =
    isSlideView &&
    slideshowChartViewMode === "history" &&
    (inZoneActive?.scope === "index" || inZoneActive?.scope === "stock");
  const showSlideshowPvt =
    isSlideView &&
    slideshowChartViewMode === "pvt" &&
    (inZoneActive?.scope === "index" || inZoneActive?.scope === "stock");

  useChartOutlookKeyboardShortcuts(
    true,
    () => handleSlideshowChartViewChange("chart"),
    () => handleSlideshowChartViewChange("outlook"),
    isSlideView && !fynnDrawerOpen && !newsDrawerOpen && !chatDrawerOpen,
    {
      historyAvailable: true,
      onHistory: () => handleSlideshowChartViewChange("history"),
      pvtAvailable: true,
      onPvt: () => handleSlideshowChartViewChange("pvt"),
    },
  );

  useTradingViewChartShortcut(
    showSlideshowPvt
      ? (activeTv?.dailyWebChartUrl ?? activeTv?.webChartUrl ?? "")
      : (activeTv?.webChartUrl ?? ""),
    isSlideView && Boolean(activeTv?.webChartUrl),
  );

  /** Deep-dive chart body — matches /levels/chart (toolbar + full-width chart, no news rail). */
  const slideshowDeepDiveLayout = Boolean(isSlideView && inZoneActive != null);

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
          slideshowPaused: slideshowTimerPaused,
          onToggleSlideshowPause: handleSlideshowTransportClick,
        }
      : null;

  useEffect(() => {
    setChartFullHistory(isSlideView);
    setSlideshowChartViewMode("pvt");
  }, [activeTv?.symbol, activeTv?.exchange, activeTv?.candlesScope, viewMode]);

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  /** Arrow keys step through the slideshow chip list (up/down rail, left/right strip). */
  useEffect(() => {
    if (!isSlideView || inZoneCount <= 1) return;
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
      const dir =
        e.key === "ArrowDown" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowUp" || e.key === "ArrowLeft"
            ? -1
            : 0;
      if (dir === 0) return;
      e.preventDefault();
      goInZone(dir);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSlideView, inZoneCount, goInZone]);

  useEffect(() => {
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [inZoneCurrent, slideshowFilter, viewMode]);

  useEffect(() => {
    if (slideshowTimerPaused || !isSlideView || inZoneCount <= 1) return;
    const id = setInterval(() => {
      setSlideshowCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [slideshowTimerPaused, isSlideView, inZoneCount, inZoneCurrent, slideshowFilter]);

  useEffect(() => {
    if (slideshowCountdown > 0) return;
    if (slideshowTimerPaused || !isSlideView || inZoneCount <= 1) return;
    setInZoneSlide((s) => (s + 1) % inZoneCount);
    setSlideshowCountdown(SLIDESHOW_SLIDE_SECONDS);
  }, [slideshowCountdown, slideshowTimerPaused, isSlideView, inZoneCount]);

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
        primeSlideshowLevelsCache(scope, symbol, json.data);
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

  /** Prefetch the next slideshow symbol during the 60s countdown. */
  useEffect(() => {
    if (!isSlideView || inZoneCount <= 1) return;
    const next = slideListFiltered[(inZoneCurrent + 1) % inZoneCount];
    if (next?.scope !== "stock" && next?.scope !== "index") return;
    void prefetchSlideshowLevels(next.scope, next.symbol);
  }, [isSlideView, inZoneCount, inZoneCurrent, slideListFiltered]);

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

    const cached = getSlideshowLevelsCache(inZoneActive.scope, inZoneActive.symbol);
    let cancelled = false;

    if (symbolChanged) {
      if (cached !== undefined) {
        setInZoneChartData(cached);
        setInZoneChartLoading(false);
      } else {
        setInZoneChartData(null);
        setInZoneChartLoading(true);
      }
    }

    void prefetchSlideshowLevels(inZoneActive.scope, inZoneActive.symbol).then((data) => {
      if (!cancelled && chartLevelsSymbolRef.current === activeKey) {
        setInZoneChartData(data);
        setInZoneChartLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [inZoneActive?.scope, inZoneActive?.symbol, inZoneActive?.data, inZoneCurrent, viewMode, isSlideView]);

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
        const override = liveSignalOverride[id];
        // Once the trend chart has reported a definitive live signal for this
        // symbol, honour it over the (laggier) cron signal so the chip never
        // contradicts the chart. Fall back to the bubble/cron tone otherwise.
        const tone =
          override !== undefined
            ? applyConfirmedSignal(
                resolveSymbolDisplayTone(it.data, {
                  scanned: Boolean(it.data),
                  spotOverride: it.spot,
                  signal: null,
                }),
                override,
              )
            : bubbleToneByKey.get(id) ??
              resolveSymbolDisplayTone(it.data, {
                scanned: Boolean(it.data),
                spotOverride: it.spot,
                signal: payload?.signals?.[it.symbol] ?? null,
              });
        return {
          id,
          label: it.label,
          sublabel: it.scope === "index" ? "Index" : "Stock",
          spot: liveStripSpot[id] ?? it.spot,
          currency: it.currency,
          trailing: <LevelsSymbolStatusBadge tone={tone} />,
        };
      }),
    [slideListFiltered, liveStripSpot, bubbleToneByKey, payload?.signals, liveSignalOverride],
  );

  const activeDisplayTone = inZoneActive
    ? (() => {
        const id = `${inZoneActive.scope}-${inZoneActive.symbol}`;
        const override = liveSignalOverride[id];
        if (override !== undefined) {
          return applyConfirmedSignal(
            resolveSymbolDisplayTone(inZoneActive.data, {
              scanned: Boolean(inZoneActive.data),
              spotOverride: inZoneActive.spot,
              signal: null,
            }),
            override,
          );
        }
        return (
          bubbleToneByKey.get(id) ??
          resolveSymbolDisplayTone(inZoneActive.data, {
            scanned: Boolean(inZoneActive.data),
            spotOverride: inZoneActive.spot,
            signal: payload?.signals?.[inZoneActive.symbol] ?? null,
          })
        );
      })()
    : null;

  const slideshowStatusOverlay = useMemo((): LevelsChartStatusOverlayProps => {
    const lv = chartLevelsForView;
    return {
      statusTone: activeDisplayTone,
      volRegime: lv?.volRegime,
      volRegimeReason: lv?.volRegimeReason,
      atmIV: lv?.atmIV,
      daysToEarnings: lv?.daysToEarnings,
    };
  }, [activeDisplayTone, chartLevelsForView]);

  const slideshowIntradayStatusOverlay = useMemo((): LevelsChartStatusOverlayProps => {
    return {
      ...slideshowStatusOverlay,
      statusTone: withoutConfirmedSignalTone(slideshowStatusOverlay.statusTone),
    };
  }, [slideshowStatusOverlay]);

  const slideshowChartPane =
    activeTv != null ? (
      showSlideshowHistory && inZoneActive ? (
        <OiHistoryChart
          className="flex-1 min-h-0 h-full w-full"
          scope={inZoneActive.scope}
          symbol={inZoneActive.symbol}
          levels={chartLevelsForView}
          webChartUrl={activeTv.webChartUrl}
          showAttribution
          statusOverlay={slideshowStatusOverlay}
        />
      ) : showSlideshowPvt && inZoneActive ? (
        <PvtChart
          className="flex-1 min-h-0 h-full w-full"
          scope={inZoneActive.scope}
          symbol={inZoneActive.symbol}
          levels={chartLevelsForView}
          webChartUrl={activeTv.dailyWebChartUrl}
          statusOverlay={slideshowStatusOverlay}
          onLiveSignal={handleLiveSignal}
        />
      ) : showSlideshowOutlook ? (
        <NiftyOutlookChart
          className="flex-1 min-h-0 h-full w-full"
          levels={activeChartLevels}
          spot={chartLevelsForView?.spot ?? activeChartLevels?.spot ?? null}
          webChartUrl={activeTv.webChartUrl}
          showAttribution
          statusOverlay={slideshowStatusOverlay}
        />
      ) : (
        <LevelsTradingViewChart
          className="flex-1 min-h-0 h-full w-full"
          config={activeTv}
          ticker={activeTicker ?? activeTv.symbol}
          companyName={activeCompanyName ?? undefined}
          levels={chartLevelsForView}
          loading={chartLevelsLoading}
          hideChartShortcuts={isSlideView}
          hideTvFooterHint={isSlideView}
          showHeader={false}
          nativeChartRef={nativeChartRef}
          onFullHistoryZoomChange={setChartFullHistory}
          onLastCloseChange={activeTv?.nativeCandles ? handleChartLastClose : undefined}
          statusOverlay={slideshowIntradayStatusOverlay}
        />
      )
    ) : (
      <div
        className="flex flex-1 items-center justify-center rounded-xl text-center px-4"
        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
      >
        <p className="text-xs">No aligned setups to chart</p>
      </div>
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
            onChange={handleSlideshowChartViewChange}
            trailing={
              showChartExpiryPicker ? (
                <LevelsChartExpiryPicker
                  options={expiryOptions}
                  value={selectedExpiryKey}
                  onChange={setSelectedExpiryKey}
                />
              ) : undefined
            }
          />
        ) : null}
        {isSlideView && slideshowExploreHold ? (
          <SlideshowAutoPauseBanner reason={slideshowExploreHold} />
        ) : null}
        {slideshowChartPane}
      </div>
    ) : (
      <div
        className="flex flex-1 items-center justify-center rounded-xl text-center px-4"
        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
      >
        <p className="text-xs">No aligned setups to chart</p>
      </div>
    );

  const viewToggleLabel =
    viewMode === "bubbles" ? "Liveslide" : "View Bubbles map";
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
      />
    ) : null;

  const slideshowStripAccent = viewMode === "favslide" ? "favslide" : "liveslide";

  const slideshowChipTimer =
    showSlideshowStripTransport && inZoneCount > 0
      ? {
          enabled: true,
          paused: inZoneCount <= 1 || slideshowTimerPaused,
          onToggle: inZoneCount > 1 ? handleSlideshowTransportClick : () => {},
          secondsRemaining: slideshowCountdown,
          pauseReason: slideshowExploreHold,
          canResume: !isSlideshowOverlayPause(slideshowExploreHold),
        }
      : undefined;

  const slideshowStripControlProps = {
    zoneFilter: "all" as const,
    onZoneFilterChange: () => {},
    filterCounts: {
      all: 0,
      bull: 0,
      bear: 0,
      near_bull: 0,
      near_bear: 0,
    },
    showFilter: false,
    mapFilter:
      viewMode === "liveslide" && slideshowFilterCounts
        ? {
            filter: slideshowFilter,
            onChange: (filter: SlideshowMapFilter) => {
              setSlideshowFilter(filter);
              setInZoneSlide(0);
            },
            counts: slideshowFilterCounts,
          }
        : undefined,
    slideModePill:
      isSlideView
        ? {
            mode: viewMode,
            count: slideListFiltered.length,
          }
        : undefined,
  };

  const favslideAddTrailing =
    viewMode === "favslide" && isFnoNinjaHost ? (
      <FnoNinjaFavslideAddButton
        api={favslideApi}
        needsSignIn={!favslideSignedIn}
        count={slideListFiltered.length}
        onAdded={() => {
          setInZoneSlide(favslideEntries.length);
        }}
      />
    ) : undefined;

  const favslideAddTrailingRail =
    viewMode === "favslide" && isFnoNinjaHost ? (
      <FnoNinjaFavslideAddButton
        api={favslideApi}
        needsSignIn={!favslideSignedIn}
        variant="rail"
        count={slideListFiltered.length}
        onAdded={() => {
          setInZoneSlide(favslideEntries.length);
        }}
      />
    ) : undefined;

  const slideshowSymbolRailTourAttrs = {
    "data-liveslide-tour": "strip",
    "data-favslide-tour": "strip",
  };

  const slideshowSymbolRailMobile =
    isSlideView && inZoneCount > 0 ? (
      <LevelsSlideshowSymbolRailMobile
        tourAttrs={slideshowSymbolRailTourAttrs}
        controls={
          <LevelsSlideshowStripControls
            {...slideshowStripControlProps}
            orientation="horizontal"
            stripTrailing={favslideAddTrailing}
          />
        }
        symbolList={
          <LevelsSymbolList
            entries={inZoneEntries}
            activeIndex={inZoneCurrent}
            onSelect={setInZoneSlide}
            layout="horizontal"
            runnerMode
            stripAccent={slideshowStripAccent}
            slideshowTimer={slideshowChipTimer}
          />
        }
      />
    ) : null;

  const slideshowSymbolRailDesktop =
    isSlideView && inZoneCount > 0 ? (
      <LevelsSlideshowSymbolRailDesktop
        tourAttrs={slideshowSymbolRailTourAttrs}
        controls={
          <LevelsSlideshowStripControls
            {...slideshowStripControlProps}
            orientation="vertical"
            stripTrailing={favslideAddTrailingRail}
          />
        }
        symbolList={
          <LevelsSymbolList
            entries={inZoneEntries}
            activeIndex={inZoneCurrent}
            onSelect={setInZoneSlide}
            layout="vertical"
            runnerMode
            stripAccent={slideshowStripAccent}
            slideshowTimer={slideshowChipTimer}
          />
        }
      />
    ) : null;

  const slideshowDeepDiveBody =
    slideshowDeepDiveLayout && inZoneActive && activeTicker ? (
      <div
        data-liveslide-tour="chart"
        data-favslide-tour="chart"
        className="flex flex-1 min-h-0 min-w-0 w-full flex-col max-md:touch-pan-y"
      >
        <LevelsChartDeepDiveLayout
          chrome={slideshowChartChrome}
          symbolRail={slideshowSymbolRailMobile}
          symbolRailDesktop={slideshowSymbolRailDesktop}
          viewToggle={
            <LevelsOutlookViewToggle
              value={slideshowChartViewMode}
              onChange={handleSlideshowChartViewChange}
              trailing={
                showChartExpiryPicker ? (
                  <LevelsChartExpiryPicker
                    options={expiryOptions}
                    value={selectedExpiryKey}
                    onChange={setSelectedExpiryKey}
                  />
                ) : undefined
              }
            />
          }
          banner={
            slideshowExploreHold ? (
              <SlideshowAutoPauseBanner reason={slideshowExploreHold} />
            ) : undefined
          }
          toolbar={
            <LevelsChartSideToolbar
              scope={inZoneActive.scope}
              symbol={activeTicker}
              label={slideshowSubtitleLine ?? inZoneActive.label}
              levels={chartLevelsForView}
              expiryKey={expiryScope ? selectedExpiryKey : null}
              nativeChartRef={nativeChartRef}
              favslideApi={favslideApi}
              favslideRemoveOnly={viewMode === "favslide"}
              onAtlasOpenChange={handleFynnDrawerOpenChange}
              onNewsOpenChange={handleNewsDrawerOpenChange}
              onNavigateBubbles={enterBubbles}
              onNavigateFavslide={enterFavslide}
              onNavigateLiveslide={enterLiveslide}
            />
          }
          footer={
            <div data-liveslide-tour="footer" data-favslide-tour="footer">
              <LevelsChartMetaFooter
                slideCount={inZoneCount}
                activeIndex={inZoneCurrent}
                onGoTo={setInZoneSlide}
                slideshowAdvanceHint
                slideshowPaused={slideshowTimerPaused}
              />
            </div>
          }
        >
          {slideshowChartPane}
        </LevelsChartDeepDiveLayout>
      </div>
    ) : null;

  const slideshowSymbolStrip =
    isSlideView && inZoneCount > 0 && !slideshowDeepDiveLayout ? (
      <LevelsSymbolList
        entries={inZoneEntries}
        activeIndex={inZoneCurrent}
        onSelect={setInZoneSlide}
        layout="horizontal"
        runnerMode
        stripAccent={slideshowStripAccent}
        slideshowTimer={slideshowChipTimer}
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
        hideLevelsColumn={opts?.hideLevelsColumn ?? slideshowDeepDiveLayout}
        listAboveChart={opts?.listAboveChart}
        chartChrome={opts?.listAboveChart && !slideshowDeepDiveLayout ? slideshowChartChrome : undefined}
        chart={
          slideshowDeepDiveLayout && slideshowDeepDiveBody ? (
            slideshowDeepDiveBody
          ) : (
            <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-md:touch-pan-y">
              <div className="flex flex-1 min-h-0 min-w-0 w-full flex-col">{tvChartColumn}</div>
              {opts?.chartFooter ? (
                <div className="shrink-0 min-w-0 max-md:pb-1">{opts.chartFooter}</div>
              ) : null}
            </div>
          )
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
    return wrapSlideshowBody(
      slideshowDeepDiveLayout ? (
        <></>
      ) : (
        <LevelsSymbolList
          entries={inZoneEntries}
          activeIndex={inZoneCurrent}
          onSelect={setInZoneSlide}
          layout="responsive"
          slideshowTimer={slideshowChipTimer}
        />
      ),
      slideshowDeepDiveLayout ? (
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
          slideshowAdvanceHint
          slideshowPaused={slideshowTimerPaused}
          showCarouselArrows={false}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center" style={{ color: "#64748b" }}>
          <p className="text-xs">No selection</p>
        </div>
      ),
      slideshowDeepDiveLayout
        ? {
            hideLevelsColumn: true,
            listAboveChart: true,
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
      maxPainVisibility={{
        visible: showMaxPainBubbles,
        onToggle: () => setShowMaxPainBubbles((v) => !v),
      }}
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
      slideshowControl={undefined}
      slideModePill={
        isSlideView
          ? {
              mode: viewMode,
              count: slideListFiltered.length,
            }
          : undefined
      }
      viewSwitchGroup={
        isSlideView && slideshowDeepDiveLayout && inZoneCount > 0
          ? undefined
          : isSlideView
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
            count={slideListFiltered.length}
            onAdded={() => {
              setInZoneSlide(favslideEntries.length);
            }}
          />
        ) : undefined
      }
      chartShortcuts={isSlideView && activeTv ? slideshowChartShortcuts : null}
      favslideToggle={
        isFnoNinjaHost
          ? {
              label: "Favslide",
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
    />
  );

  const guestBubblePreview =
    levelsSignInGate && !slideAuthUser && viewMode === "bubbles";

  const guestFeaturedBubbleIds = useMemo(
    () => (guestBubblePreview ? pickGuestPreviewBubbleIds(bubbleItems) : undefined),
    [guestBubblePreview, bubbleItems],
  );

  const levelsMainPane =
    viewMode === "bubbles" ? (
      <LevelsBubblesView
        items={bubbleItems}
        onBubbleOpen={openBubbleChart}
        hasMarketData={Boolean(payload)}
        toneFilter={bubbleMapFilter}
        showMaxPainBubbles={showMaxPainBubbles}
        showChatFloater={!guestBubblePreview}
        guestPreview={guestBubblePreview}
        featuredBubbleIds={guestFeaturedBubbleIds}
        suppressBubbleStacking={chatDrawerOpen}
      />
    ) : (
      renderSlideshow()
    );

  const hideTopSlideshowToolbar = isSlideView && slideshowDeepDiveLayout && inZoneCount > 0;

  const levelsWorkspace = (
    <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:flex-none max-md:overflow-visible md:overflow-hidden">
      {!hideTopSlideshowToolbar ? (
        <div className="shrink-0">{levelsSlideshowToolbar}</div>
      ) : null}
      <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:flex-none max-md:overflow-visible md:overflow-hidden">
        {levelsMainPane}
      </div>
    </div>
  );

  return (
    <main className={`${FNO_LEVELS_MAIN} min-w-0`} style={FNO_APP_SURFACE_STYLE}>
      <Suspense fallback={null}>
        <FnoNinjaLiveslideWalkthroughBridge onPrepare={prepareSlideshowWalkthrough} />
        <LevelsViewUrlSync
          viewMode={viewMode}
          onEnterLiveslide={enterLiveslide}
          onEnterFavslide={enterFavslide}
        />
      </Suspense>
      <div
        className={`${FNO_LEVELS_SHELL} flex-1 min-h-0 flex flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden`}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : levelsSignInGate && !slideAuthUser ? (
          guestBubblePreview ? (
            <div
              className={`relative flex flex-1 min-h-0 w-full flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden ${FNO_MOBILE_SLIDE_BODY_MIN_CLASS}`}
            >
              <div className="flex flex-1 min-h-0 flex-col pointer-events-none select-none">
                {levelsWorkspace}
              </div>
              <FnoNinjaMarketMapGuestGate />
            </div>
          ) : (
            <FnoNinjaChartLoginGate
              overlay={isSlideView}
              headline={viewMode === "bubbles" ? "Unlock NSE F&O Market Map" : undefined}
              backAction={
                isSlideView ? { label: "Back to Market Map", onClick: enterBubbles } : undefined
              }
            >
              {levelsWorkspace}
            </FnoNinjaChartLoginGate>
          )
        ) : levelsSignInGate && slideAuthLoading ? (
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
