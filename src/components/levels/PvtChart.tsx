"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { LevelsChartClusterBandLabels } from "@/components/levels/LevelsChartClusterBandLabels";
import {
  applyClusterSummaryPriceLines,
  mergedPriceRange,
} from "@/components/levels/native-chart-level-overlays";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import { computePvt, PVT_LOOKBACK_DAYS } from "@/lib/levels/pvt";
import {
  isSlideshowZoneStale,
  SLIDESHOW_ZONE_TICK_MS,
} from "@/lib/levels/slideshow-zones";
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

function levelsHaveBands(data: PublicLevels | null | undefined): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

export function PvtChart({
  scope,
  symbol,
  levels: levelsProp,
  className,
  hideGuide = false,
}: {
  scope: LevelsTvScope;
  symbol: string;
  /** Optional parent levels — PVT also fetches its own when mounted. */
  levels?: PublicLevels | null;
  className?: string;
  hideGuide?: boolean;
}) {
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const pvtRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candleChartDataRef = useRef<CandlestickData[]>([]);
  const [candles, setCandles] = useState<DailyCandle[] | null>(null);
  const [fetchedLevels, setFetchedLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [range, setRange] = useState<PvtHistoryRange>("6M");

  const effectiveLevels = useMemo(() => {
    if (levelsHaveBands(levelsProp)) return levelsProp;
    if (levelsHaveBands(fetchedLevels)) return fetchedLevels;
    return levelsProp ?? fetchedLevels;
  }, [levelsProp, fetchedLevels]);

  const levelsRef = useRef(effectiveLevels);
  levelsRef.current = effectiveLevels;

  useEffect(() => {
    setRange("6M");
    setFetchedLevels(null);
  }, [scope, symbol]);

  const loadOptionLevels = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLevelsLoading(true);
      try {
        const json = await fetchSymbolLevels(scope, symbol, { slideshow: true });
        setFetchedLevels(json.data);
      } catch {
        if (!opts?.quiet) setFetchedLevels(null);
      } finally {
        if (!opts?.quiet) setLevelsLoading(false);
      }
    },
    [scope, symbol],
  );

  /** Fetch option-chain zones whenever the PVT tab is open (same API as Chart tab). */
  useEffect(() => {
    void loadOptionLevels();
  }, [loadOptionLevels]);

  useEffect(() => {
    const id = setInterval(() => {
      if (isSlideshowZoneStale(effectiveLevels?.computedAt)) {
        void loadOptionLevels({ quiet: true });
      }
    }, SLIDESHOW_ZONE_TICK_MS);
    return () => clearInterval(id);
  }, [scope, symbol, effectiveLevels?.computedAt, loadOptionLevels]);

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

    candlesSeries.applyOptions({
      autoscaleInfoProvider: () => {
        const range = mergedPriceRange(candleChartDataRef.current, levelsRef.current);
        return range ? { priceRange: range } : null;
      },
    });

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
      priceLinesRef.current = [];
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const pvtLine = pvtRef.current;
    const chart = chartRef.current;
    if (!chartReady || !candleSeries || !pvtLine || !chart || displayCandles.length === 0) return;

    const candleData: CandlestickData[] = displayCandles.map((c) => ({
      time: toChartTime(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleChartDataRef.current = candleData;

    candleSeries.setData(candleData);
    pvtLine.setData(
      pvtSeries.map((p) => ({
        time: toChartTime(p.time),
        value: p.value,
      })),
    );
    applyClusterSummaryPriceLines(candleSeries, priceLinesRef, effectiveLevels);
    chart.timeScale().fitContent();
  }, [chartReady, displayCandles, pvtSeries, effectiveLevels]);

  const shellStyle = hideGuide ? COMPACT_SHELL_STYLE : CHART_SHELL_STYLE;
  const guideFooter = hideGuide ? null : (
    <div className={GUIDE_FOOTER_CLASS}>
      <p className="text-[11px] font-semibold" style={{ color: "#cbd5e1" }}>
        Trend Chart — Price Volume Trend (PVT)
      </p>
      <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
        Daily candles with put/call cluster + max pain lines; PVT below resets to zero at the
        start of the selected window.
      </p>
    </div>
  );

  const candlesReady = !loading && !error && displayCandles.length > 0;
  const zonesReady = levelsHaveBands(effectiveLevels);
  const showOverlay = !candlesReady;
  const showZonesOverlay = candlesReady && levelsLoading && !zonesReady;
  const overlayMessage = loading
    ? "Loading PVT…"
    : levelsLoading
      ? "Loading option levels…"
      : error ?? "Not enough daily data for PVT.";
  const showClusterLabels = chartReady && candlesReady && zonesReady;

  return (
    <div className={className} style={shellStyle}>
      <PvtRangeToggle value={range} onChange={setRange} />
      <div ref={overlayRootRef} className="relative min-h-0 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {showClusterLabels ? (
          <LevelsChartClusterBandLabels
            chartRef={chartRef}
            seriesRef={candleRef}
            containerRef={overlayRootRef}
            levels={effectiveLevels}
            visible
          />
        ) : null}
        {showOverlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-[rgba(0,0,0,0.45)]">
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  {overlayMessage}
                </p>
              </>
            ) : (
              <p className="text-sm px-6 text-center" style={{ color: "#64748b" }}>
                {overlayMessage}
              </p>
            )}
          </div>
        ) : showZonesOverlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-[rgba(0,0,0,0.35)]">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Loading option levels…
            </p>
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
