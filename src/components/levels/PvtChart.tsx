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
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { LevelsChartClusterBandLabels } from "@/components/levels/LevelsChartClusterBandLabels";
import { LevelsChartAttributionOverlay } from "@/components/levels/LevelsChartAttributionOverlay";
import { LevelsChartCandleTypeBadge } from "@/components/levels/LevelsChartCandleTypeBadge";
import { LevelsGlobalChatTrigger } from "@/components/levels/LevelsGlobalChatTrigger";
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
/** Gap between the last candle and the right price-axis labels. */
const PVT_CHART_RIGHT_OFFSET = 14;

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
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { labelVisible: false },
  },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
} as const;

function linkVisibleRanges(
  source: IChartApi,
  target: IChartApi,
  pauseRef: { current: boolean },
): () => void {
  let syncing = false;
  const handler = (range: { from: number; to: number } | null) => {
    if (syncing || pauseRef.current || range == null) return;
    syncing = true;
    target.timeScale().setVisibleLogicalRange(range);
    syncing = false;
  };
  source.timeScale().subscribeVisibleLogicalRangeChange(handler);
  return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
}

function priceAtTime(
  rows: { time: Time; close?: number; value?: number }[],
  time: Time,
  pick: (row: { time: Time; close?: number; value?: number }) => number | undefined,
): number | null {
  const row = rows.find((entry) => entry.time === time);
  const price = row ? pick(row) : undefined;
  return price ?? null;
}

/** Keep crosshair (and the PVT time-axis date label) in sync across panes. */
function linkCrosshairs(
  candleChart: IChartApi,
  candleSeries: ISeriesApi<"Candlestick">,
  pvtChart: IChartApi,
  pvtSeries: ISeriesApi<"Line">,
  candleRowsRef: { current: CandlestickData[] },
  pvtRowsRef: { current: LineData[] },
): () => void {
  let syncing = false;

  const syncTarget = (
    targetChart: IChartApi,
    targetSeries: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
    param: MouseEventParams,
    rows: { time: Time; close?: number; value?: number }[],
    pick: (row: { time: Time; close?: number; value?: number }) => number | undefined,
  ) => {
    if (syncing) return;
    syncing = true;
    if (!param.time) {
      targetChart.clearCrosshairPosition();
    } else {
      const price = priceAtTime(rows, param.time, pick);
      if (price != null) {
        targetChart.setCrosshairPosition(price, param.time, targetSeries);
      } else {
        targetChart.clearCrosshairPosition();
      }
    }
    syncing = false;
  };

  const syncToPvt = (param: MouseEventParams) => {
    syncTarget(pvtChart, pvtSeries, param, pvtRowsRef.current, (row) => row.value);
  };
  const syncToCandle = (param: MouseEventParams) => {
    syncTarget(candleChart, candleSeries, param, candleRowsRef.current, (row) => row.close);
  };

  candleChart.subscribeCrosshairMove(syncToPvt);
  pvtChart.subscribeCrosshairMove(syncToCandle);
  return () => {
    candleChart.unsubscribeCrosshairMove(syncToPvt);
    pvtChart.unsubscribeCrosshairMove(syncToCandle);
  };
}

function filterCandlesByRange(candles: DailyCandle[], range: PvtHistoryRange): DailyCandle[] {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1]!.time;
  const cutoff = last - RANGE_CALENDAR_DAYS[range] * 86_400;
  return candles.filter((c) => c.time >= cutoff);
}

function applyPvtRightPadding(
  candleChart: IChartApi,
  pvtChart: IChartApi,
  barCount: number,
  pauseRef: { current: boolean },
) {
  if (barCount < 1) return;
  const to = barCount - 1 + PVT_CHART_RIGHT_OFFSET;
  const range = { from: 0, to };
  pauseRef.current = true;
  try {
    candleChart.timeScale().applyOptions({ rightOffset: PVT_CHART_RIGHT_OFFSET });
    pvtChart.timeScale().applyOptions({ rightOffset: PVT_CHART_RIGHT_OFFSET });
    candleChart.timeScale().setVisibleLogicalRange(range);
    pvtChart.timeScale().setVisibleLogicalRange(range);
  } finally {
    pauseRef.current = false;
  }
}

function viewportShowsFullHistory(
  candleChart: IChartApi,
  barCount: number,
): boolean {
  const visible = candleChart.timeScale().getVisibleLogicalRange();
  if (!visible) return false;
  const expectedTo = barCount - 1 + PVT_CHART_RIGHT_OFFSET;
  return visible.from <= 1 && visible.to >= expectedTo - 2;
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
  webChartUrl,
  className,
  showAttribution = true,
}: {
  scope: LevelsTvScope;
  symbol: string;
  /** Optional parent levels — PVT also fetches its own when mounted. */
  levels?: PublicLevels | null;
  webChartUrl?: string;
  className?: string;
  showAttribution?: boolean;
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
  const pvtChartDataRef = useRef<LineData[]>([]);
  const displayBarCountRef = useRef(0);
  const rangeSyncPausedRef = useRef(false);
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
        const json = await fetchSymbolLevels(scope, symbol, {
          slideshow: true,
          // Paint the banded first-pass right away so the overlay clears without
          // waiting on the multi-expiry retry round-trip.
          onPartial: opts?.quiet
            ? undefined
            : (data) => {
                if (levelsHaveBands(data)) setFetchedLevels(data);
              },
        });
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

  const refreshPvtChartViewport = useCallback(() => {
    const candleChart = candleChartRef.current;
    const pvtChart = pvtChartRef.current;
    const barCount = displayBarCountRef.current;
    if (!candleChart || !pvtChart || barCount < 1) return false;
    applyPvtRightPadding(candleChart, pvtChart, barCount, rangeSyncPausedRef);
    return viewportShowsFullHistory(candleChart, barCount);
  }, []);

  const schedulePvtChartViewport = useCallback(() => {
    let attempts = 0;
    const tryApply = () => {
      const ok = refreshPvtChartViewport();
      if (!ok && ++attempts < 24) {
        setTimeout(tryApply, 50);
      }
    };
    requestAnimationFrame(() => {
      tryApply();
      requestAnimationFrame(tryApply);
    });
  }, [refreshPvtChartViewport]);

  const scheduleViewportRef = useRef(schedulePvtChartViewport);
  scheduleViewportRef.current = schedulePvtChartViewport;

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
        rightOffset: PVT_CHART_RIGHT_OFFSET,
      },
    });

    const pvtChart = createChart(pvtEl, {
      ...CHART_BASE_OPTIONS,
      autoSize: true,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: true },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        minimumHeight: 28,
        rightOffset: PVT_CHART_RIGHT_OFFSET,
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

    const unlinkCandle = linkVisibleRanges(candleChart, pvtChart, rangeSyncPausedRef);
    const unlinkPvt = linkVisibleRanges(pvtChart, candleChart, rangeSyncPausedRef);
    const unlinkCrosshair = linkCrosshairs(
      candleChart,
      candlesSeries,
      pvtChart,
      pvtLine,
      candleChartDataRef,
      pvtChartDataRef,
    );

    candleChartRef.current = candleChart;
    pvtChartRef.current = pvtChart;
    candleRef.current = candlesSeries;
    pvtRef.current = pvtLine;
    setChartReady(true);

    const ro = new ResizeObserver(() => {
      if (displayBarCountRef.current >= 1) scheduleViewportRef.current();
    });
    ro.observe(candleEl);

    return () => {
      ro.disconnect();
      unlinkCandle();
      unlinkPvt();
      unlinkCrosshair();
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
    if (!chartReady || !candleSeries || !pvtLine || displayCandles.length === 0) {
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
    const pvtData: LineData[] = pvtSeries.map((p) => ({
      time: toChartTime(p.time),
      value: p.value,
    }));
    pvtChartDataRef.current = pvtData;

    candleSeries.setData(candleData);
    pvtLine.setData(pvtData);
    displayBarCountRef.current = displayCandles.length;
    if (levelsHaveBands(levelsRef.current)) {
      applyClusterSummaryPriceLines(candleSeries, priceLinesRef, levelsRef.current, {
        showAxisLabels: true,
      });
    }
    schedulePvtChartViewport();
  }, [chartReady, displayCandles, pvtSeries, schedulePvtChartViewport]);

  /** Levels load after candles (common when remounting from History) — update overlays only. */
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!chartReady || !candleSeries || displayCandles.length === 0) return;
    displayBarCountRef.current = displayCandles.length;
    applyClusterSummaryPriceLines(candleSeries, priceLinesRef, effectiveLevels, {
      showAxisLabels: true,
    });
    schedulePvtChartViewport();
  }, [chartReady, effectiveLevels, displayCandles.length, schedulePvtChartViewport]);

  useEffect(() => {
    if (!chartReady || displayBarCountRef.current < 1) return;
    schedulePvtChartViewport();
  }, [chartReady, schedulePvtChartViewport]);

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
      <div className="relative flex flex-col flex-1 min-h-0 gap-2">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={overlayRootRef} className="relative min-h-0 flex-1 overflow-hidden">
            <div ref={candleContainerRef} className="absolute inset-0" />
            {candlesReady ? <LevelsChartCandleTypeBadge label="Daily Candles" /> : null}
            {showClusterLabels ? (
              <LevelsChartClusterBandLabels
                chartRef={candleChartRef}
                seriesRef={candleRef}
                containerRef={overlayRootRef}
                levels={effectiveLevels}
                visible
                showZoneRole
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
          {showAttribution && candlesReady ? (
            <LevelsChartAttributionOverlay
              variant="trend"
              placement="below"
              levels={effectiveLevels}
              webChartUrl={webChartUrl}
              showTradingView={Boolean(webChartUrl)}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end px-1 py-0.5 min-h-[2.25rem]">
          <LevelsGlobalChatTrigger />
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
