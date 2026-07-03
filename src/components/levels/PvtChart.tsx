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
  const [range, setRange] = useState<PvtHistoryRange>("6M");

  useEffect(() => {
    setRange("6M");
  }, [scope, symbol]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });

    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceScaleId: "right",
    });
    candlesSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.38 },
    });

    const pvtLine = chart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceScaleId: "pvt",
      priceFormat: {
        type: "custom",
        formatter: fmtPvt,
      },
    });
    chart.priceScale("pvt").applyOptions({
      scaleMargins: { top: 0.62, bottom: 0.05 },
      borderColor: "rgba(255,255,255,0.08)",
    });

    chartRef.current = chart;
    candleRef.current = candlesSeries;
    pvtRef.current = pvtLine;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      pvtRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const pvtLine = pvtRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !pvtLine || !chart || displayCandles.length === 0) return;

    candleSeries.setData(
      displayCandles.map((c) => ({
        time: epochUtcToChartIstSeconds(c.time) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    pvtLine.setData(
      pvtSeries.map((p) => ({
        time: epochUtcToChartIstSeconds(p.time) as UTCTimestamp,
        value: p.value,
      })),
    );
    chart.timeScale().fitContent();
  }, [displayCandles, pvtSeries]);

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

  if (loading) {
    return (
      <div className={className} style={shellStyle}>
        <PvtRangeToggle value={range} onChange={setRange} />
        <div className="min-h-0 overflow-hidden relative flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            Loading PVT…
          </p>
        </div>
        {guideFooter}
      </div>
    );
  }

  if (error || displayCandles.length === 0) {
    return (
      <div className={className} style={shellStyle}>
        {(candles?.length ?? 0) > 0 ? (
          <PvtRangeToggle value={range} onChange={setRange} />
        ) : (
          <div />
        )}
        <div className="min-h-0 overflow-hidden relative flex items-center justify-center">
          <p className="text-sm px-6 text-center" style={{ color: "#64748b" }}>
            {error ?? "Not enough daily data for PVT."}
          </p>
        </div>
        {guideFooter}
      </div>
    );
  }

  return (
    <div className={className} style={shellStyle}>
      <PvtRangeToggle value={range} onChange={setRange} />
      <div ref={containerRef} className="min-h-0 overflow-hidden relative" />
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
