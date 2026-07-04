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
import { LevelsChartCandleTypeBadge } from "@/components/levels/LevelsChartCandleTypeBadge";
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

const COMPACT_SHELL_STYLE = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minHeight: 0,
} as const;

const PVT_SECTION_HEIGHT = 156;
const PVT_SECTION_HEADER_HEIGHT = 24;

const PVT_SECTION_SHELL_CLASS =
  "shrink-0 mx-0.5 rounded-xl border border-amber-500/30 bg-[#0a101c] overflow-hidden " +
  "shadow-[0_-10px_32px_rgba(0,0,0,0.55),0_6px_18px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(251,191,36,0.14)] " +
  "ring-1 ring-inset ring-amber-500/10";

const CHART_BASE_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "#94a3b8",
    fontSize: 11,
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
} as const;

function linkVisibleRanges(source: IChartApi, target: IChartApi): () => void {
  let syncing = false;
  const handler = (range: { from: number; to: number } | null) => {
    if (syncing || range == null) return;
    syncing = true;
    target.timeScale().setVisibleLogicalRange(range);
    syncing = false;
  };
  source.timeScale().subscribeVisibleLogicalRangeChange(handler);
  return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
}

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
}: {
  scope: LevelsTvScope;
  symbol: string;
  /** Optional parent levels — PVT also fetches its own when mounted. */
  levels?: PublicLevels | null;
  className?: string;
}) {
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const candleContainerRef = useRef<HTMLDivElement>(null);
  const pvtContainerRef = useRef<HTMLDivElement>(null);
  const candleChartRef = useRef<IChartApi | null>(null);
  const pvtChartRef = useRef<IChartApi | null>(null);
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
    const candleEl = candleContainerRef.current;
    const pvtEl = pvtContainerRef.current;
    if (!candleEl || !pvtEl) return;

    setChartReady(false);
    const candleChart = createChart(candleEl, {
      ...CHART_BASE_OPTIONS,
      autoSize: true,
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        visible: false,
        timeVisible: false,
        secondsVisible: false,
      },
    });

    const pvtChart = createChart(pvtEl, {
      ...CHART_BASE_OPTIONS,
      autoSize: true,
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });

    const candlesSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    candlesSeries.applyOptions({
      autoscaleInfoProvider: () => {
        const range = mergedPriceRange(candleChartDataRef.current, levelsRef.current);
        return range ? { priceRange: range } : null;
      },
    });

    const pvtLine = pvtChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: "custom",
        formatter: fmtPvt,
      },
    });

    const unlinkCandle = linkVisibleRanges(candleChart, pvtChart);
    const unlinkPvt = linkVisibleRanges(pvtChart, candleChart);

    candleChartRef.current = candleChart;
    pvtChartRef.current = pvtChart;
    candleRef.current = candlesSeries;
    pvtRef.current = pvtLine;
    setChartReady(true);

    return () => {
      unlinkCandle();
      unlinkPvt();
      candleChart.remove();
      pvtChart.remove();
      candleChartRef.current = null;
      pvtChartRef.current = null;
      candleRef.current = null;
      pvtRef.current = null;
      priceLinesRef.current = [];
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const pvtLine = pvtRef.current;
    const candleChart = candleChartRef.current;
    const pvtChart = pvtChartRef.current;
    if (
      !chartReady ||
      !candleSeries ||
      !pvtLine ||
      !candleChart ||
      !pvtChart ||
      displayCandles.length === 0
    ) {
      return;
    }

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
    candleChart.timeScale().fitContent();
    pvtChart.timeScale().fitContent();
  }, [chartReady, displayCandles, pvtSeries, effectiveLevels]);

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
    <div className={className} style={COMPACT_SHELL_STYLE}>
      <PvtRangeToggle value={range} onChange={setRange} />
      <div className="flex flex-col flex-1 min-h-0 gap-2">
        <div ref={overlayRootRef} className="relative flex-1 min-h-0 overflow-hidden">
          <div ref={candleContainerRef} className="absolute inset-0" />
          {candlesReady ? <LevelsChartCandleTypeBadge label="Daily Candles" /> : null}
          {showClusterLabels ? (
            <LevelsChartClusterBandLabels
              chartRef={candleChartRef}
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

        <div className={PVT_SECTION_SHELL_CLASS} style={{ height: PVT_SECTION_HEIGHT }}>
          <div
            className="flex items-center gap-2 px-2.5 border-b border-amber-500/25 bg-[#0c1424]/95"
            style={{ height: PVT_SECTION_HEADER_HEIGHT }}
          >
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "#fbbf24" }}
            >
              PVT Trendline
            </span>
            <span className="text-[9px] font-medium" style={{ color: "rgba(251, 191, 36, 0.55)" }}>
              Price Volume Trend
            </span>
          </div>
          <div
            className="relative min-h-0 overflow-hidden"
            style={{ height: PVT_SECTION_HEIGHT - PVT_SECTION_HEADER_HEIGHT }}
          >
            <div ref={pvtContainerRef} className="absolute inset-0" />
          </div>
        </div>
      </div>
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
