"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const POLL_MS = 60_000;
/** Empty bars on the right so POC / zone labels stay clear of the last candle. */
const RIGHT_OFFSET_BARS = 28;

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
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create the chart once.
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
        minimumWidth: 72,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: RIGHT_OFFSET_BARS,
        fixRightEdge: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceFormat: { type: "price", precision: 2, minMove: 0.05 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
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
        seriesRef.current?.setData(data);
        if (initial) {
          const ts = chartRef.current?.timeScale();
          ts?.applyOptions({ rightOffset: RIGHT_OFFSET_BARS });
          ts?.scrollToRealTime();
        }
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

  // Overlay bull/bear/POC level lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (!levels) return;

    const add = (price: number | null | undefined, color: string, title: string) => {
      if (price == null || !Number.isFinite(price)) return;
      priceLinesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    add(levels.bullHigh, "#16a34a", "Bull H");
    add(levels.bullLow, "#16a34a", "Bull L");
    add(levels.bearHigh, "#dc2626", "Bear H");
    add(levels.bearLow, "#dc2626", "Bear L");
    add(levels.poc, "#f59e0b", "POC");
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
