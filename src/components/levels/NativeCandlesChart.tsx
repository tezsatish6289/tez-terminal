"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  applyLevelPriceLines,
  bandLineData,
  mergedPriceRange,
} from "@/components/levels/native-chart-level-overlays";

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const POLL_MS = 60_000;
/** Empty bars on the right so candles sit left of zone price labels. */
const RIGHT_OFFSET_BARS = 18;

const BULL_BAND_STYLE = {
  lineVisible: false,
  baseLineVisible: false,
  lastValueVisible: false,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  topFillColor1: "rgba(34, 197, 94, 0.38)",
  topFillColor2: "rgba(34, 197, 94, 0.14)",
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
  topFillColor1: "rgba(239, 68, 68, 0.38)",
  topFillColor2: "rgba(239, 68, 68, 0.14)",
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
export function NativeCandlesChart({
  symbol,
  interval = "5",
  levels,
  loading: levelsLoading,
}: {
  symbol: string;
  interval?: string;
  levels?: PublicLevels | null;
  /** Parent is still fetching zone levels for overlays. */
  loading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bullBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const bearBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<CandlestickData[]>([]);
  const levelsRef = useRef<PublicLevels | null | undefined>(levels);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  levelsRef.current = levels;

  function applyRightPadding() {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
    // Re-apply after layout so fitPriceScale does not collapse the gap.
    requestAnimationFrame(() => {
      chartRef.current?.timeScale().applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
      chartRef.current?.timeScale().scrollToRealTime();
    });
  }

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

    if (lv.bullLow != null && lv.bullHigh != null && lv.bullHigh > lv.bullLow) {
      bullBand.applyOptions({
        ...BULL_BAND_STYLE,
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
        minimumWidth: 80,
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

  // Load + poll candles for the active symbol/interval.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load(initial: boolean) {
      if (initial) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(
          `/api/freedombot/levels/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok: boolean; candles?: ApiCandle[]; error?: string };
        if (cancelled) return;
        if (!json.ok || !json.candles?.length) {
          if (initial) setError(json.error ?? "No chart data available");
          return;
        }
        const data: CandlestickData[] = json.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candlesRef.current = data;
        seriesRef.current?.setData(data);
        syncZoneBands(data, levelsRef.current);
        applyLevelPriceLines(seriesRef.current!, priceLinesRef, levelsRef.current);
        fitPriceScale();
        applyRightPadding();
        setError(null);
      } catch (e) {
        if (!cancelled && initial) {
          setError(e instanceof Error ? e.message : "Failed to load chart");
        }
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }

    load(true);
    timer = setInterval(() => load(false), POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol, interval]);

  // Zone bands, lines, and vertical fit when levels change.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    syncZoneBands(candlesRef.current, levels);
    applyLevelPriceLines(series, priceLinesRef, levels);
    fitPriceScale();
    applyRightPadding();
  }, [levels, symbol]);

  return (
    <div className="relative w-full h-full min-h-[260px]">
      <div ref={containerRef} className="absolute inset-0" />
      {(loading || levelsLoading) && (
        <div className="absolute inset-0 flex items-center justify-center gap-2" style={{ color: "#64748b" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">
            {levelsLoading && !loading ? `Loading ${symbol} levels…` : `Loading ${symbol} candles…`}
          </span>
        </div>
      )}
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={{ color: "#64748b" }}>
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
