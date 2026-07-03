"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { computePvt, PVT_LOOKBACK_DAYS } from "@/lib/levels/pvt";
import { epochUtcToChartIstSeconds } from "@/lib/market-hours";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

interface DailyCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type PvtHistoryRange = "1M" | "3M" | "6M";

const RANGE_CALENDAR_DAYS: Record<PvtHistoryRange, number> = {
  "1M": 31,
  "3M": 92,
  "6M": PVT_LOOKBACK_DAYS,
};

const CHART_SHELL_STYLE = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  minHeight: 0,
} as const;

const COMPACT_SHELL_STYLE = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minHeight: 0,
} as const;

const GUIDE_FOOTER_CLASS =
  "shrink-0 min-h-[5rem] border-t border-white/10 bg-[#070d1a] px-3 py-2.5 relative z-10";

const PVT_PANE_HEIGHT = 140;

function filterCandlesByRange(candles: DailyCandle[], range: PvtHistoryRange): DailyCandle[] {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1]!.time;
  const cutoff = last - RANGE_CALENDAR_DAYS[range] * 86_400;
  return candles.filter((c) => c.time >= cutoff);
}

function fmtPvt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function toChartTime(epochSec: number): UTCTimestamp {
  return epochUtcToChartIstSeconds(epochSec) as UTCTimestamp;
}

export function PvtChart({
  scope,
  symbol,
  className,
  hideGuide = false,
}: {
  scope: LevelsTvScope;
  symbol: string;
  className?: string;
  hideGuide?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const pvtRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [candles, setCandles] = useState<DailyCandle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [range, setRange] = useState<PvtHistoryRange>("6M");

  useEffect(() => {
    setRange("6M");
  }, [scope, symbol]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCandles(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/freedombot/levels/candles?scope=${scope}&symbol=${encodeURIComponent(symbol)}&interval=D&days=${PVT_LOOKBACK_DAYS}`,
        );
        const json = (await res.json()) as { ok?: boolean; candles?: DailyCandle[]; error?: string };
        if (cancelled) return;
        if (!json.ok || !json.candles?.length) {
          setCandles([]);
          setError(json.error ?? "Chart data isn't available for this symbol yet.");
          return;
        }
        setCandles(json.candles);
      } catch {
        if (!cancelled) setError("Could not load PVT chart.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, symbol]);

  const displayCandles = useMemo(
    () => filterCandlesByRange(candles ?? [], range),
    [candles, range],
  );

  const pvtSeries = useMemo(() => computePvt(displayCandles), [displayCandles]);

  // Chart shell must stay mounted while loading — otherwise the ref is null and init never runs.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setChartReady(false);
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
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });

    const candlesSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#16a34a",
        downColor: "#dc2626",
        borderUpColor: "#16a34a",
        borderDownColor: "#dc2626",
        wickUpColor: "#16a34a",
        wickDownColor: "#dc2626",
      },
      0,
    );

    const pvtLine = chart.addSeries(
      LineSeries,
      {
        color: "#60a5fa",
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: fmtPvt,
        },
      },
      1,
    );

    const pvtPane = chart.panes()[1];
    if (pvtPane) {
      pvtPane.setHeight(PVT_PANE_HEIGHT);
    }

    chartRef.current = chart;
    candleRef.current = candlesSeries;
    pvtRef.current = pvtLine;
    setChartReady(true);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      pvtRef.current = null;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const pvtLine = pvtRef.current;
    const chart = chartRef.current;
    if (!chartReady || !candleSeries || !pvtLine || !chart || displayCandles.length === 0) return;

    candleSeries.setData(
      displayCandles.map((c) => ({
        time: toChartTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    pvtLine.setData(
      pvtSeries.map((p) => ({
        time: toChartTime(p.time),
        value: p.value,
      })),
    );
    chart.timeScale().fitContent();
  }, [chartReady, displayCandles, pvtSeries]);

  const shellStyle = hideGuide ? COMPACT_SHELL_STYLE : CHART_SHELL_STYLE;
  const guideFooter = hideGuide ? null : (
    <div className={GUIDE_FOOTER_CLASS}>
      <p className="text-[11px] font-semibold" style={{ color: "#cbd5e1" }}>
        Price Volume Trend (PVT)
      </p>
      <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
        Daily candles on top; PVT below resets to zero at the start of the selected window.
        Rising PVT suggests volume-backed buying; falling PVT suggests distribution.
      </p>
    </div>
  );

  const showOverlay = loading || Boolean(error) || displayCandles.length === 0;

  return (
    <div className={className} style={shellStyle}>
      <PvtRangeToggle value={range} onChange={setRange} />
      <div className="relative min-h-0 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {showOverlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-[rgba(0,0,0,0.45)]">
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  Loading PVT…
                </p>
              </>
            ) : (
              <p className="text-sm px-6 text-center" style={{ color: "#64748b" }}>
                {error ?? "Not enough daily data for PVT."}
              </p>
            )}
          </div>
        ) : null}
      </div>
      {guideFooter}
    </div>
  );
}

function PvtRangeToggle({
  value,
  onChange,
}: {
  value: PvtHistoryRange;
  onChange: (v: PvtHistoryRange) => void;
}) {
  const options: PvtHistoryRange[] = ["1M", "3M", "6M"];
  return (
    <div className="mb-1.5 flex shrink-0 items-center gap-1 self-start rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
              color: active ? "#bfdbfe" : "#94a3b8",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
