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
const RIGHT_OFFSET_BARS = 40;
const RIGHT_PRICE_SCALE_MIN_WIDTH = 108;
/** ~5 days of 15m bars at 24/7 crypto (96 bars/day). */
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
  const suggestedRef = useRef(suggested);
  const spotRef = useRef(spot);
  const hasDisplayedCandlesRef = useRef(false);
  const loadedForSymbolRef = useRef<string | null>(null);
  const fullHistoryZoomRef = useRef(false);

  const [bootLoading, setBootLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  suggestedRef.current = suggested;
  spotRef.current = spot;

  function applyRightPadding(barCount = candlesRef.current.length) {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
    chartRef.current?.priceScale("right").applyOptions({
      minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
    });
    requestAnimationFrame(() => {
      chartRef.current?.timeScale().applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
      chartRef.current?.priceScale("right").applyOptions({
        minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
      });
      chartRef.current?.timeScale().scrollToRealTime();
    });
  }

  function applyDefaultZoom(barCount: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts || barCount < 2) return;
    const from = Math.max(0, barCount - DEFAULT_VISIBLE_BARS);
    ts.setVisibleLogicalRange({ from, to: barCount - 1 + RIGHT_OFFSET_BARS });
    ts.applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
    fullHistoryZoomRef.current = false;
  }

  function applyFullHistoryZoom(barCount: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts || barCount < 2) return;
    ts.setVisibleLogicalRange({ from: 0, to: barCount - 1 + RIGHT_OFFSET_BARS });
    ts.applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
    fullHistoryZoomRef.current = true;
  }

  const fitPriceScale = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    const range = mergedSimPriceRange(
      candlesRef.current,
      suggestedRef.current,
      spotRef.current,
      DEFAULT_VISIBLE_BARS,
    );
    if (!range) return;
    series.priceScale().setAutoScale(false);
    series.priceScale().setVisibleRange({ from: range.from, to: range.to });
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
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: RIGHT_OFFSET_BARS,
        fixRightEdge: false,
        minimumHeight: 28,
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
          DEFAULT_VISIBLE_BARS,
        );
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
    applySimPriceLines(series, priceLinesRef, suggestedRef.current, spotRef.current);
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
    return true;
  }

  function clearChartCanvas() {
    candlesRef.current = [];
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
    applySimPriceLines(series, priceLinesRef, null, null);
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
        fullHistoryZoomRef.current = false;
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
    applySimPriceLines(series, priceLinesRef, suggested, spot);
    fitPriceScale();
    applyRightPadding(candlesRef.current.length);
  }, [suggested, spot, symbol, fitPriceScale]);

  const showChartOverlay = bootLoading || swapping;
  const chartReady = !showChartOverlay && !error;

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
