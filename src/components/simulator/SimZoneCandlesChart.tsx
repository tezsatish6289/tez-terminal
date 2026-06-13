"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { SimChartBandLabels } from "@/components/simulator/SimChartBandLabels";
import {
  applySimPriceLines,
  mergedSimPriceRange,
  syncSimZoneBands,
} from "@/components/simulator/sim-native-chart-overlays";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { noClusterLine } from "@/components/simulator/heatmap-types";

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const BOT_SYMBOL: Record<CockpitBotId, string> = {
  crypto: "BTCUSDT",
  btc: "BTCUSDT",
  eth: "ETHUSDT",
  sol: "SOLUSDT",
  xrp: "XRPUSDT",
};

const POLL_MS = 60_000;
const INTERVAL = "15";
/** Gap between the last candle and right-axis labels — fraction of chart pane width. */
const RIGHT_OFFSET_PANE_RATIO = 0.1;
const RIGHT_OFFSET_PIXELS_MIN = 48;
/** Extra width for Support/Resistance, max-pain, and current-price axis labels. */
const RIGHT_PRICE_SCALE_MIN_WIDTH = 152;
/** Default LWC margins are top 0.2 / bottom 0.1 — far too much for zone charts. */
const TIGHT_SCALE_MARGINS = { top: 0.03, bottom: 0.03 };

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

export function SimZoneCandlesChart({
  botId,
  suggested,
  spot,
}: {
  botId: CockpitBotId;
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
}) {
  const symbol = BOT_SYMBOL[botId];
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bullBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const bearBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<CandlestickData[]>([]);
  const lastCandleRef = useRef<{ open: number; close: number } | null>(null);
  const suggestedRef = useRef(suggested);
  const spotRef = useRef(spot);
  const hasDisplayedCandlesRef = useRef(false);
  const loadedForSymbolRef = useRef<string | null>(null);
  /** Boot with full 7d history visible (matches fnoninja slideshow default). */
  const fullHistoryZoomRef = useRef(true);

  const [bootLoading, setBootLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  suggestedRef.current = suggested;
  spotRef.current = spot;

  function chartPaneWidthPx(): number {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (chart) {
      const w = chart.timeScale().width();
      if (w > 0) return w;
    }
    if (el && el.clientWidth > 0) {
      return Math.max(0, el.clientWidth - RIGHT_PRICE_SCALE_MIN_WIDTH);
    }
    return 0;
  }

  function rightOffsetPixels(): number {
    const pane = chartPaneWidthPx();
    if (pane <= 0) return RIGHT_OFFSET_PIXELS_MIN;
    return Math.max(RIGHT_OFFSET_PIXELS_MIN, Math.round(pane * RIGHT_OFFSET_PANE_RATIO));
  }

  /** Keep ~10% empty pane width between candles and price-line axis labels. */
  function syncChartViewport() {
    const chart = chartRef.current;
    const ts = chart?.timeScale();
    if (!chart || !ts || candlesRef.current.length < 2) return;

    const apply = () => {
      const c = chartRef.current;
      const scale = c?.timeScale();
      if (!c || !scale) return;
      const pixels = rightOffsetPixels();
      c.priceScale("right").applyOptions({
        minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
      });
      scale.applyOptions({ rightOffsetPixels: pixels });
      if (fullHistoryZoomRef.current) {
        scale.fitContent();
      } else {
        scale.scrollToRealTime();
      }
    };

    apply();
    // Re-apply after layout / price-scale width settles (chart may boot while hidden).
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  const fitPriceScale = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    const range = mergedSimPriceRange(
      candlesRef.current,
      suggestedRef.current,
      spotRef.current,
    );
    if (!range) return;
    const ps = series.priceScale();
    ps.applyOptions({ scaleMargins: TIGHT_SCALE_MARGINS });
    ps.setAutoScale(false);
    ps.setVisibleRange({ from: range.from, to: range.to });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
        scaleMargins: TIGHT_SCALE_MARGINS,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffsetPixels: RIGHT_OFFSET_PIXELS_MIN,
        fixRightEdge: false,
        minimumHeight: 28,
        ticksVisible: true,
      },
    });

    const bearBand = chart.addSeries(BaselineSeries, {
      ...BEAR_BAND_STYLE,
      visible: false,
      autoscaleInfoProvider: () => null,
    });
    const bullBand = chart.addSeries(BaselineSeries, {
      ...BULL_BAND_STYLE,
      visible: false,
      autoscaleInfoProvider: () => null,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "price",
        precision: spot != null && spot < 10 ? 4 : 2,
        minMove: spot != null && spot < 10 ? 0.0001 : 0.01,
      },
    });

    series.applyOptions({
      autoscaleInfoProvider: () => {
        const range = mergedSimPriceRange(
          candlesRef.current,
          suggestedRef.current,
          spotRef.current,
        );
        return range ? { priceRange: range } : null;
      },
    });

    chartRef.current = chart;
    bearBandRef.current = bearBand;
    bullBandRef.current = bullBand;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (candlesRef.current.length >= 2) syncChartViewport();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      bearBandRef.current = null;
      bullBandRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      candlesRef.current = [];
    };
  }, []);

  function applyCandlesToChart(data: CandlestickData[], isPoll: boolean): boolean {
    const series = seriesRef.current;
    if (!series) return false;
    series.setData(data);
    syncSimZoneBands(
      bearBandRef.current,
      bullBandRef.current,
      data,
      suggestedRef.current,
      BULL_BAND_STYLE,
      BEAR_BAND_STYLE,
    );
    applySimPriceLines(
      series,
      priceLinesRef,
      suggestedRef.current,
      spotRef.current,
      lastCandleRef.current,
    );
    fitPriceScale();
    fullHistoryZoomRef.current = !isPoll || fullHistoryZoomRef.current;
    syncChartViewport();
    hasDisplayedCandlesRef.current = true;
    loadedForSymbolRef.current = symbol;
    setError(null);
    setSwapping(false);
    setBootLoading(false);
    return true;
  }

  function clearChartCanvas() {
    candlesRef.current = [];
    lastCandleRef.current = null;
    loadedForSymbolRef.current = null;
    const series = seriesRef.current;
    if (!series) return;
    series.setData([]);
    syncSimZoneBands(
      bearBandRef.current,
      bullBandRef.current,
      [],
      null,
      BULL_BAND_STYLE,
      BEAR_BAND_STYLE,
    );
    applySimPriceLines(series, priceLinesRef, null, null, null);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let fetchRetries = 0;
    const MAX_FETCH_RETRIES = 3;

    async function load(isPoll: boolean) {
      if (!isPoll) {
        fullHistoryZoomRef.current = true;
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
          `/api/sim/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(INTERVAL)}`,
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
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candlesRef.current = data;
        const last = data[data.length - 1];
        lastCandleRef.current =
          last != null
            ? { open: last.open, close: last.close }
            : null;

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
  }, [symbol]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candlesRef.current.length === 0) return;
    if (loadedForSymbolRef.current !== symbol) return;

    syncSimZoneBands(
      bearBandRef.current,
      bullBandRef.current,
      candlesRef.current,
      suggested,
      BULL_BAND_STYLE,
      BEAR_BAND_STYLE,
    );
    applySimPriceLines(series, priceLinesRef, suggested, spot, lastCandleRef.current);
    fitPriceScale();
    syncChartViewport();
  }, [suggested, spot, symbol, fitPriceScale]);

  useEffect(() => {
    const tvUrl = (() => {
      const u = new URL("https://www.tradingview.com/chart/");
      u.searchParams.set("symbol", `BYBIT:${symbol}.P`);
      u.searchParams.set("interval", INTERVAL);
      return u.toString();
    })();

    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el?.tagName) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        window.open(tvUrl, "_blank", "noopener,noreferrer");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [symbol]);

  const showChartOverlay = bootLoading || swapping;
  const chartReady = !showChartOverlay && !error;

  useEffect(() => {
    if (!chartReady || candlesRef.current.length < 2) return;
    syncChartViewport();
  }, [chartReady]);

  const missingBull = suggested.bullZoneLow == null || suggested.bullZoneHigh == null;
  const missingBear = suggested.bearZoneLow == null || suggested.bearZoneHigh == null;

  return (
    <div className="relative w-full h-full min-h-[200px] flex-1 flex flex-col">
      <div
        ref={containerRef}
        className="absolute inset-0 min-h-[200px] rounded-lg border border-white/[0.12] bg-[#0a0a0e] overflow-hidden"
        style={{
          opacity: chartReady ? 1 : 0,
          visibility: chartReady ? "visible" : "hidden",
        }}
      />
      {showChartOverlay && (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-[#0a0a0e]"
          style={{ color: "#64748b" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading {symbol} chart…</span>
        </div>
      )}
      {!bootLoading && error && (
        <div
          className="absolute inset-0 flex items-center justify-center px-4 text-center rounded-lg border border-white/[0.12] bg-[#0a0a0e]"
          style={{ color: "#64748b" }}
        >
          <p className="text-xs">{error}</p>
        </div>
      )}
      <SimChartBandLabels
        chartRef={chartRef}
        seriesRef={seriesRef}
        containerRef={containerRef}
        suggested={suggested}
        visible={chartReady}
      />
      {(missingBull || missingBear) && chartReady && (
        <p className="shrink-0 text-[9px] text-muted-foreground/45 italic mt-1 text-center px-2">
          {missingBull && noClusterLine("bull", suggested)}
          {missingBull && missingBear ? " · " : ""}
          {missingBear && noClusterLine("bear", suggested)}
        </p>
      )}
    </div>
  );
}
