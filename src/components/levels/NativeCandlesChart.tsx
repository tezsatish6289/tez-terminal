"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { LevelsChartShortcuts } from "@/components/levels/LevelsChartShortcuts";
import { LevelsChartClusterBandLabels } from "@/components/levels/LevelsChartClusterBandLabels";
import { LevelsChartTvFooterHint } from "@/components/levels/LevelsChartTvFooterHint";
import {
  applyLevelPriceLines,
  bandFillForFocus,
  bandLineData,
  mergedPriceRange,
  type LevelVisualFocus,
  zoneSlAnchors,
} from "@/components/levels/native-chart-level-overlays";
import { LevelsChartBrandWatermark } from "@/components/levels/LevelsChartBrandWatermark";
import { LevelsChartFocusGlow } from "@/components/levels/LevelsChartFocusGlow";
import { compositeChartShareImage } from "@/lib/levels/chart-share-image";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { epochUtcToChartIstSeconds } from "@/lib/market-hours";

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const POLL_MS = 60_000;
/** Empty bars on the right so candles sit left of zone price labels (Support/Resistance). */
const RIGHT_OFFSET_BARS = 40;
/** Slideshow / 30-day view: scale offset with bar count so labels stay clear when bars are dense. */
const RIGHT_OFFSET_SLIDESHOW_MIN = 56;
const RIGHT_OFFSET_SLIDESHOW_MAX = 110;
/** Extra width for longer right-axis level titles (Support H/L/Break, Resistance…). */
const RIGHT_PRICE_SCALE_MIN_WIDTH = 108;
const RIGHT_PRICE_SCALE_SLIDESHOW_WIDTH = 152;
/** Mobile: cluster pills on-chart; axis uses compact titles (Put OI, MP). */
const RIGHT_OFFSET_MOBILE = 6;
const RIGHT_OFFSET_SLIDESHOW_MOBILE_MIN = 8;
const RIGHT_OFFSET_SLIDESHOW_MOBILE_MAX = 18;
const RIGHT_PRICE_SCALE_MOBILE_MIN_WIDTH = 88;
const RIGHT_PRICE_SCALE_MOBILE_SLIDESHOW_WIDTH = 96;
const NARROW_CHART_MQ = "(max-width: 767px)";
/** Default zoom: ~5 NSE sessions visible (15m ≈ 25 bars/day). */
const DEFAULT_VISIBLE_BARS = 125;

const BULL_BAND_STYLE = {
  lineVisible: false,
  baseLineVisible: false,
  lastValueVisible: false,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  topFillColor1: LEVELS_ZONE_CHART.bull.nativeBandTop,
  topFillColor2: LEVELS_ZONE_CHART.bull.nativeBandBottom,
  bottomFillColor1: "rgba(34, 197, 94, 0)",
  bottomFillColor2: "rgba(34, 197, 94, 0)",
  topLineColor: "rgba(34, 197, 94, 0)",
  bottomLineColor: "rgba(34, 197, 94, 0)",
};

const BEAR_BAND_STYLE = {
  lineVisible: false,
  baseLineVisible: false,
  lastValueVisible: false,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  topFillColor1: LEVELS_ZONE_CHART.bear.nativeBandTop,
  topFillColor2: LEVELS_ZONE_CHART.bear.nativeBandBottom,
  bottomFillColor1: "rgba(239, 68, 68, 0)",
  bottomFillColor2: "rgba(239, 68, 68, 0)",
  topLineColor: "rgba(239, 68, 68, 0)",
  bottomLineColor: "rgba(239, 68, 68, 0)",
};

/**
 * Native candlestick chart for NSE stocks, fed by Dhan candles
 * (/api/freedombot/levels/candles). Used where the TradingView embed
 * can't show licensed NSE equity data.
 */
export interface NativeCandlesChartHandle {
  toggleHistoryZoom: () => void;
  captureShareImage: (opts: {
    symbol: string;
    subtitle?: string | null;
    shareUrl: string;
  }) => Promise<Blob | null>;
}

export const NativeCandlesChart = forwardRef<
  NativeCandlesChartHandle,
  {
    symbol: string;
    candlesScope?: "stock" | "index";
    interval?: string;
    levels?: PublicLevels | null;
    /** Parent is still fetching zone levels for overlays. */
    loading?: boolean;
    webChartUrl: string;
    showSlideshowControl?: boolean;
    slideshowPaused?: boolean;
    onToggleSlideshowPause?: () => void;
    /** Slideshow: no overlay shortcut stack; use tvFooterHint instead. */
    hideShortcuts?: boolean;
    /** Hide centred TradingView footer copy when shortcuts are hidden. */
    hideTvFooterHint?: boolean;
    /** Slideshow: fit all loaded ~30d candles on first paint (and on symbol change). */
    defaultFullHistory?: boolean;
    /** On-chart FNONINJA watermark (default true). */
    showBrandWatermark?: boolean;
    onFullHistoryZoomChange?: (full: boolean) => void;
    /** Last candle close — keeps strip / header price in sync with the chart. */
    onLastCloseChange?: (close: number) => void;
    /** Science learn guide: dim non-focused zones and add glow on the active topic. */
    visualFocus?: LevelVisualFocus | null;
    /** When set, skip candle fetch and use parent-provided bars (e.g. learn page). */
    externalCandles?: CandlestickData[] | null;
    externalCandlesLoading?: boolean;
  }
>(function NativeCandlesChart(
  {
    symbol,
    candlesScope = "stock",
    interval = "15",
    levels,
    loading: levelsLoading,
    webChartUrl,
    showSlideshowControl,
    slideshowPaused,
    onToggleSlideshowPause,
    hideShortcuts = false,
    hideTvFooterHint = false,
    defaultFullHistory = false,
    showBrandWatermark = true,
    onFullHistoryZoomChange,
    onLastCloseChange,
    visualFocus = null,
    externalCandles,
    externalCandlesLoading = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shareRootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bullBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const bearBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<CandlestickData[]>([]);
  const levelsRef = useRef<PublicLevels | null | undefined>(levels);

  const hasDisplayedCandlesRef = useRef(false);
  const loadedForSymbolRef = useRef<string | null>(null);
  const fullHistoryZoomRef = useRef(false);
  const [fullHistoryZoom, setFullHistoryZoom] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  levelsRef.current = levels;
  const visualFocusRef = useRef(visualFocus);
  visualFocusRef.current = visualFocus;
  const defaultFullHistoryRef = useRef(defaultFullHistory);
  defaultFullHistoryRef.current = defaultFullHistory;
  const isNarrowChartRef = useRef(false);

  function isNarrowChart(): boolean {
    return isNarrowChartRef.current;
  }

  function priceScaleMinWidth(): number {
    const narrow = isNarrowChart();
    const wideHistory = defaultFullHistoryRef.current;
    if (narrow) {
      return wideHistory
        ? RIGHT_PRICE_SCALE_MOBILE_SLIDESHOW_WIDTH
        : RIGHT_PRICE_SCALE_MOBILE_MIN_WIDTH;
    }
    return wideHistory ? RIGHT_PRICE_SCALE_SLIDESHOW_WIDTH : RIGHT_PRICE_SCALE_MIN_WIDTH;
  }

  function rightOffsetBars(barCount: number): number {
    const wideHistory = defaultFullHistoryRef.current || fullHistoryZoomRef.current;
    const narrow = isNarrowChart();
    if (!wideHistory) return narrow ? RIGHT_OFFSET_MOBILE : RIGHT_OFFSET_BARS;
    const ratio = narrow ? 0.04 : 0.12;
    const min = narrow ? RIGHT_OFFSET_SLIDESHOW_MOBILE_MIN : RIGHT_OFFSET_SLIDESHOW_MIN;
    const max = narrow ? RIGHT_OFFSET_SLIDESHOW_MOBILE_MAX : RIGHT_OFFSET_SLIDESHOW_MAX;
    const scaled = Math.round(barCount * ratio);
    return Math.min(max, Math.max(min, scaled));
  }

  function applyRightPadding(barCount = candlesRef.current.length) {
    const offset = rightOffsetBars(barCount);
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const narrow = isNarrowChart();
    chartRef.current?.applyOptions({ layout: { fontSize: narrow ? 9 : 11 } });
    ts.applyOptions({ rightOffset: offset });
    chartRef.current?.priceScale("right").applyOptions({
      minimumWidth: priceScaleMinWidth(),
    });
    // Re-apply after layout so fitPriceScale does not collapse the gap.
    requestAnimationFrame(() => {
      const n = candlesRef.current.length;
      const off = rightOffsetBars(n);
      chartRef.current?.timeScale().applyOptions({ rightOffset: off });
      chartRef.current?.priceScale("right").applyOptions({
        minimumWidth: priceScaleMinWidth(),
      });
      chartRef.current?.timeScale().scrollToRealTime();
    });
  }

  function refreshChartLayout() {
    const series = seriesRef.current;
    const n = candlesRef.current.length;
    if (!series || n < 2) return;
    applyLevelPriceLines(
      series,
      priceLinesRef,
      levelsRef.current,
      visualFocusRef.current,
      isNarrowChart(),
    );
    applyRightPadding(n);
    if (fullHistoryZoomRef.current) applyFullHistoryZoom(n);
    else applyDefaultZoom(n);
  }

  /** Show recent sessions by default; older history available on scroll-left. */
  function applyDefaultZoom(barCount: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts || barCount < 2) return;
    const offset = rightOffsetBars(barCount);
    const from = Math.max(0, barCount - DEFAULT_VISIBLE_BARS);
    ts.setVisibleLogicalRange({ from, to: barCount - 1 + offset });
    ts.applyOptions({ rightOffset: offset });
    fullHistoryZoomRef.current = false;
    setFullHistoryZoom(false);
    onFullHistoryZoomChange?.(false);
  }

  /** Fit all loaded bars (30d history); toggle back with S when already full. */
  function applyFullHistoryZoom(barCount: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts || barCount < 2) return;
    const offset = rightOffsetBars(barCount);
    ts.setVisibleLogicalRange({ from: 0, to: barCount - 1 + offset });
    ts.applyOptions({ rightOffset: offset });
    fullHistoryZoomRef.current = true;
    setFullHistoryZoom(true);
    onFullHistoryZoomChange?.(true);
  }

  const toggleHistoryZoom = useCallback(() => {
    const n = candlesRef.current.length;
    if (n < 2) return;
    if (fullHistoryZoomRef.current) applyDefaultZoom(n);
    else applyFullHistoryZoom(n);
  }, [onFullHistoryZoomChange]);

  const captureShareImage = useCallback(
    async (opts: { symbol: string; subtitle?: string | null; shareUrl: string }) => {
      const root = shareRootRef.current;
      if (!root) return null;
      return compositeChartShareImage(root, {
        ...opts,
        levels: levelsRef.current,
      });
    },
    [],
  );

  useImperativeHandle(ref, () => ({ toggleHistoryZoom, captureShareImage }), [
    toggleHistoryZoom,
    captureShareImage,
  ]);

  function fitPriceScale() {
    const series = seriesRef.current;
    if (!series) return;
    const range = mergedPriceRange(candlesRef.current, levelsRef.current);
    if (!range) return;
    // IPriceScaleApi.setVisibleRange uses { from, to } — minValue/maxValue blanked the chart.
    series.priceScale().setAutoScale(false);
    series.priceScale().setVisibleRange({ from: range.from, to: range.to });
  }

  function syncZoneBands(candles: CandlestickData[], lv: PublicLevels | null | undefined) {
    const bullBand = bullBandRef.current;
    const bearBand = bearBandRef.current;
    if (!bullBand || !bearBand) return;

    if (!lv || candles.length === 0) {
      bullBand.setData([]);
      bearBand.setData([]);
      return;
    }

    const focus = visualFocusRef.current;
    const bullFill = bandFillForFocus("bull", focus);
    const bearFill = bandFillForFocus("bear", focus);

    if (lv.bullLow != null && lv.bullHigh != null && lv.bullHigh > lv.bullLow) {
      bullBand.applyOptions({
        ...BULL_BAND_STYLE,
        ...bullFill,
        visible: true,
        baseValue: { type: "price", price: lv.bullLow },
      });
      bullBand.setData(bandLineData(candles, lv.bullHigh));
    } else {
      bullBand.setData([]);
      bullBand.applyOptions({ visible: false });
    }

    if (lv.bearLow != null && lv.bearHigh != null && lv.bearHigh > lv.bearLow) {
      bearBand.applyOptions({
        ...BEAR_BAND_STYLE,
        ...bearFill,
        visible: true,
        baseValue: { type: "price", price: lv.bearLow },
      });
      bearBand.setData(bandLineData(candles, lv.bearHigh));
    } else {
      bearBand.setData([]);
      bearBand.applyOptions({ visible: false });
    }
  }

  // Create the chart once (bands below candles).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof window !== "undefined") {
      isNarrowChartRef.current = window.matchMedia(NARROW_CHART_MQ).matches;
    }
    const narrow = isNarrowChartRef.current;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: narrow ? 9 : 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: narrow
        ? {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false,
          }
        : true,
      kineticScroll: narrow ? { touch: false, mouse: false } : { touch: true, mouse: false },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        minimumWidth: narrow
          ? defaultFullHistory
            ? RIGHT_PRICE_SCALE_MOBILE_SLIDESHOW_WIDTH
            : RIGHT_PRICE_SCALE_MOBILE_MIN_WIDTH
          : defaultFullHistory
            ? RIGHT_PRICE_SCALE_SLIDESHOW_WIDTH
            : RIGHT_PRICE_SCALE_MIN_WIDTH,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: narrow
          ? defaultFullHistory
            ? RIGHT_OFFSET_SLIDESHOW_MOBILE_MIN
            : RIGHT_OFFSET_MOBILE
          : defaultFullHistory
            ? RIGHT_OFFSET_SLIDESHOW_MIN
            : RIGHT_OFFSET_BARS,
        fixRightEdge: false,
        minimumHeight: defaultFullHistory ? 30 : 28,
        ticksVisible: true,
      },
    });

    const bearBand = chart.addSeries(BaselineSeries, { ...BEAR_BAND_STYLE, visible: false });
    const bullBand = chart.addSeries(BaselineSeries, { ...BULL_BAND_STYLE, visible: false });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceFormat: { type: "price", precision: 2, minMove: 0.05 },
    });

    series.applyOptions({
      autoscaleInfoProvider: () => {
        const range = mergedPriceRange(candlesRef.current, levelsRef.current);
        return range ? { priceRange: range } : null;
      },
    });

    chartRef.current = chart;
    bearBandRef.current = bearBand;
    bullBandRef.current = bullBand;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      bearBandRef.current = null;
      bullBandRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      candlesRef.current = [];
    };
  }, []);

  // Re-fit candles + axis when crossing the mobile breakpoint.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_CHART_MQ);
    const onChange = () => {
      const next = mq.matches;
      if (next === isNarrowChartRef.current) return;
      isNarrowChartRef.current = next;
      chartRef.current?.applyOptions({
        handleScroll: next
          ? {
              mouseWheel: true,
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: false,
            }
          : true,
        kineticScroll: next ? { touch: false, mouse: false } : { touch: true, mouse: false },
      });
      refreshChartLayout();
    };
    isNarrowChartRef.current = mq.matches;
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function applyCandlesToChart(
    data: CandlestickData[],
    isPoll: boolean,
  ): boolean {
    const series = seriesRef.current;
    if (!series) return false;
    series.setData(data);
    syncZoneBands(data, levelsRef.current);
    applyLevelPriceLines(
      series,
      priceLinesRef,
      levelsRef.current,
      visualFocusRef.current,
      isNarrowChart(),
    );
    fitPriceScale();
    if (!isPoll) {
      if (fullHistoryZoomRef.current) applyFullHistoryZoom(data.length);
      else applyDefaultZoom(data.length);
    } else {
      applyRightPadding(data.length);
    }
    hasDisplayedCandlesRef.current = true;
    loadedForSymbolRef.current = symbol;
    setError(null);
    setSwapping(false);
    setBootLoading(false);
    const lastClose = data[data.length - 1]?.close;
    if (lastClose != null && Number.isFinite(lastClose)) {
      onLastCloseChange?.(lastClose);
    }
    return true;
  }

  function clearChartCanvas() {
    candlesRef.current = [];
    loadedForSymbolRef.current = null;
    const series = seriesRef.current;
    if (!series) return;
    series.setData([]);
    syncZoneBands([], null);
    applyLevelPriceLines(series, priceLinesRef, null, null, isNarrowChart());
  }

  // Apply parent-provided candles (learn guide shares one fetch across sections).
  useEffect(() => {
    if (externalCandles === undefined) return;
    if (externalCandlesLoading) {
      setBootLoading(true);
      setSwapping(true);
      return;
    }
    if (!externalCandles || externalCandles.length === 0) {
      setError("Chart data is temporarily unavailable.");
      setBootLoading(false);
      setSwapping(false);
      return;
    }
    candlesRef.current = externalCandles;
    const finish = () => {
      if (applyCandlesToChart(externalCandles, false)) return;
      let attempts = 0;
      const retry = () => {
        if (applyCandlesToChart(externalCandles, false)) return;
        if (++attempts < 40) setTimeout(retry, 50);
        else {
          setBootLoading(false);
          setSwapping(false);
        }
      };
      setTimeout(retry, 0);
    };
    requestAnimationFrame(finish);
  }, [externalCandles, externalCandlesLoading, symbol]);

  // Load + poll candles for the active symbol/interval.
  useEffect(() => {
    if (externalCandles !== undefined) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchRetries = 0;
    const MAX_FETCH_RETRIES = 3;

    async function load(isPoll: boolean) {
      if (!isPoll) {
        fullHistoryZoomRef.current = defaultFullHistory;
        setFullHistoryZoom(defaultFullHistory);
        hasDisplayedCandlesRef.current = false;
        loadedForSymbolRef.current = null;
        clearChartCanvas();
      }
      const isBoot = !hasDisplayedCandlesRef.current;
      if (!isPoll) {
        setBootLoading(true);
        setSwapping(true);
        setError(null);
      }
      try {
        const res = await fetch(
          `/api/freedombot/levels/candles?symbol=${encodeURIComponent(symbol)}&scope=${encodeURIComponent(candlesScope)}&interval=${encodeURIComponent(interval)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as {
          ok: boolean;
          candles?: ApiCandle[];
          error?: string;
          retryable?: boolean;
        };
        if (cancelled) return;
        if (!json.ok || !json.candles?.length) {
          if (isBoot) {
            setError(json.error ?? "Chart data is temporarily unavailable.");
            setBootLoading(false);
            setSwapping(false);
            // Transient failures (rate limit / temporary) — retry soon instead
            // of waiting for the full 60s poll cycle.
            if (json.retryable && fetchRetries < MAX_FETCH_RETRIES) {
              fetchRetries += 1;
              fetchRetryTimer = setTimeout(() => void load(true), 5000);
            }
          } else {
            setSwapping(false);
          }
          return;
        }
        fetchRetries = 0;
        const data: CandlestickData[] = json.candles.map((c) => ({
          time: epochUtcToChartIstSeconds(c.time) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candlesRef.current = data;

        const finish = () => {
          if (cancelled) return;
          if (applyCandlesToChart(data, isPoll)) return;
          let attempts = 0;
          const retry = () => {
            if (cancelled) return;
            if (applyCandlesToChart(data, isPoll)) return;
            if (++attempts < 40) {
              retryTimer = setTimeout(retry, 50);
            } else if (isBoot) {
              setError("Chart could not initialize — try refreshing");
              setBootLoading(false);
              setSwapping(false);
            } else {
              setSwapping(false);
            }
          };
          retryTimer = setTimeout(retry, 0);
        };

        requestAnimationFrame(finish);
      } catch {
        if (!cancelled && isBoot) {
          setError("Chart data is temporarily unavailable — retrying shortly.");
          setBootLoading(false);
          setSwapping(false);
          if (fetchRetries < MAX_FETCH_RETRIES) {
            fetchRetries += 1;
            fetchRetryTimer = setTimeout(() => void load(true), 5000);
          }
        } else if (!cancelled && !isPoll) {
          setSwapping(false);
        }
      }
    }

    load(false);
    timer = setInterval(() => load(true), POLL_MS);

    return () => {
      cancelled = true;
      setSwapping(false);
      if (timer) clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
      if (fetchRetryTimer) clearTimeout(fetchRetryTimer);
    };
  }, [symbol, candlesScope, interval, defaultFullHistory]);

  // Zone bands, lines, and vertical fit when levels arrive (same symbol).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candlesRef.current.length === 0) return;
    if (loadedForSymbolRef.current !== symbol) return;

    syncZoneBands(candlesRef.current, levels);
    applyLevelPriceLines(
      series,
      priceLinesRef,
      levels,
      visualFocus,
      isNarrowChart(),
    );
    fitPriceScale();
    applyRightPadding(candlesRef.current.length);
  }, [levels, defaultFullHistory, symbol, visualFocus]);

  const awaitingLevels =
    levelsLoading && (hideShortcuts || !hasDisplayedCandlesRef.current);
  const showChartOverlay = bootLoading || swapping || awaitingLevels;
  const chartReady = !showChartOverlay && !error;

  const resolveHintTopPx = useCallback(() => {
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!series || !el || !levels) return null;
    const { bullSl } = zoneSlAnchors(levels);
    if (bullSl == null) return null;
    const y = series.priceToCoordinate(bullSl);
    if (y == null) return null;
    const hintRows = 2 + (showSlideshowControl ? 1 : 0);
    const stackReserve = hintRows * 58 + 12;
    return Math.min(Math.max(y + 14, 8), el.clientHeight - stackReserve);
  }, [levels, showSlideshowControl]);

  return (
    <div
      ref={shareRootRef}
      className="relative w-full h-full min-h-[180px] flex-1 max-md:touch-pan-y"
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          opacity: chartReady ? 1 : 0,
          visibility: chartReady ? "visible" : "hidden",
        }}
      />
      {showChartOverlay && (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2"
          style={{ color: "#64748b", backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">
            {awaitingLevels && !bootLoading && !swapping
              ? `Loading ${symbol} levels…`
              : `Loading ${symbol} chart…`}
          </span>
        </div>
      )}
      {!bootLoading && error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={{ color: "#64748b" }}>
          <p className="text-xs">{error}</p>
        </div>
      )}
      {!hideShortcuts ? (
        <LevelsChartShortcuts
          webChartUrl={webChartUrl}
          resolveTopPx={resolveHintTopPx}
          showSqueeze
          squeezed={fullHistoryZoom}
          onSqueeze={toggleHistoryZoom}
          showSlideshowControl={showSlideshowControl}
          slideshowPaused={slideshowPaused}
          onToggleSlideshowPause={onToggleSlideshowPause}
        />
      ) : hideTvFooterHint ? null : (
        <LevelsChartTvFooterHint
          webChartUrl={webChartUrl}
          zonesExpiry={levels?.zonesExpiry}
          rightInsetPx={priceScaleMinWidth()}
        />
      )}
      <LevelsChartClusterBandLabels
        chartRef={chartRef}
        seriesRef={seriesRef}
        containerRef={containerRef}
        levels={levels}
        visible={chartReady}
        visualFocus={visualFocus}
      />
      {visualFocus && chartReady ? (
        <LevelsChartFocusGlow
          chartRef={chartRef}
          seriesRef={seriesRef}
          containerRef={containerRef}
          levels={levels}
          focus={visualFocus}
          visible={chartReady}
        />
      ) : null}
      {showBrandWatermark && chartReady ? <LevelsChartBrandWatermark /> : null}
    </div>
  );
});
