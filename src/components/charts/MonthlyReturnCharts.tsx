"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  buildMonthlyReturnSeries,
  type MonthlyReturnPoint,
} from "@/lib/monthly-returns";
import type { BtcMonthlyReturnPoint } from "@/lib/btc-monthly-returns";
import type { ClosedTradeLike } from "@/lib/equity-curve";
import { useAnimatedNumber, useChartMotion } from "@/hooks/use-chart-motion";
import {
  BRAND_CURVE_FILL_OPACITY,
  BRAND_CURVE_STROKE,
  brandMetricColor,
} from "@/lib/chart-brand-colors";

export interface MonthlyReturnChartsProps {
  trades: ClosedTradeLike[];
  startingCapital: number;
  cs?: string;
  theme?: "blue" | "white";
  className?: string;
  /** Overlay BTC buy-and-hold benchmark (CRYPTO stats only). */
  showBtcBenchmark?: boolean;
}

/** Orange-400 — matched brightness to brand blue-400 curve stroke. */
const BTC_LINE = "#fb923c";

type ChartRow = MonthlyReturnPoint & {
  monthAbbr: string;
  yearLabel: string | null;
  btcMonthlyReturnPct?: number;
  btcCumulativeReturnPct?: number;
};

function fmtPct(v: number, dp = 1): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(dp)}%`;
}

function pctAxis(v: number): string {
  return `${v.toFixed(0)}%`;
}

function enrichRow(
  row: MonthlyReturnPoint,
  dense: boolean,
  showYear: boolean,
): ChartRow {
  const d = new Date(`${row.monthKey}-01T12:00:00`);
  const monthAbbr = dense ? format(d, "MMM").slice(0, 2) : format(d, "MMM");
  const yearLabel = showYear ? row.monthKey.slice(0, 4) : null;
  return { ...row, monthAbbr, yearLabel };
}

function mergeBtcSeries(
  portfolio: MonthlyReturnPoint[],
  btcPoints: BtcMonthlyReturnPoint[],
  dense: boolean,
): ChartRow[] {
  const btcMap = new Map(btcPoints.map((p) => [p.monthKey, p]));
  return portfolio.map((row, i) => {
    const year = row.monthKey.slice(0, 4);
    const prevYear = i > 0 ? portfolio[i - 1].monthKey.slice(0, 4) : null;
    const showYear = i === 0 || year !== prevYear;
    const base = enrichRow(row, dense, showYear);
    const btc = btcMap.get(row.monthKey);
    if (!btc) return base;
    return {
      ...base,
      btcMonthlyReturnPct: btc.btcMonthlyReturnPct,
      btcCumulativeReturnPct: btc.btcCumulativeReturnPct,
    };
  });
}

function portfolioTitle(data: MonthlyReturnPoint[]): string {
  if (!data.length) return "Portfolio Performance Summary";
  const m0 = format(new Date(`${data[0].monthKey}-01T12:00:00`), "MMMM yyyy");
  const m1 = format(new Date(`${data[data.length - 1].monthKey}-01T12:00:00`), "MMMM yyyy");
  const months = data.length;
  return `Portfolio Performance Summary — ${m0} to ${m1} (${months} Month${months !== 1 ? "s" : ""})`;
}

function xTickInterval(monthCount: number): number | "preserveStartEnd" {
  if (monthCount <= 8) return 0;
  if (monthCount <= 16) return 1;
  if (monthCount <= 28) return 2;
  return 3;
}

function niceYMax(maxVal: number): number {
  if (maxVal <= 10) return 10;
  if (maxVal <= 25) return Math.ceil(maxVal / 5) * 5;
  if (maxVal <= 50) return Math.ceil(maxVal / 10) * 10;
  if (maxVal <= 100) return Math.ceil(maxVal / 20) * 20;
  return Math.ceil(maxVal / 25) * 25;
}

/** Simple end-of-line % label (no bubble). */
function LineEndPctLabel(props: {
  x?: number;
  y?: number;
  value?: number;
  index?: number;
  lastIndex?: number;
  visible?: boolean;
  color?: string;
  dx?: number;
  dy?: number;
}) {
  const {
    x = 0,
    y = 0,
    value,
    index = 0,
    lastIndex = 0,
    visible = true,
    color = BRAND_CURVE_STROKE,
    dx = 8,
    dy = 0,
  } = props;
  if (!visible || index !== lastIndex || value == null || !Number.isFinite(value)) return null;

  return (
    <text
      x={x + dx}
      y={y + dy}
      fill={color}
      fontSize={11}
      fontWeight={700}
      dominantBaseline="middle"
      style={{ pointerEvents: "none" }}
    >
      {fmtPct(value, 1)}
    </text>
  );
}

function MonthYearAxisTick({
  x = 0,
  y = 0,
  payload,
  dense,
  rows,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  dense: boolean;
  rows: ChartRow[];
}) {
  const row = rows.find((r) => r.monthKey === payload?.value);
  if (!row) return null;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={8}
        textAnchor="middle"
        fill="rgba(255,255,255,0.45)"
        fontSize={dense ? 8 : 9}
      >
        {row.monthAbbr}
      </text>
      {row.yearLabel && (
        <text
          x={0}
          y={0}
          dy={20}
          textAnchor="middle"
          fill="rgba(255,255,255,0.28)"
          fontSize={8}
          fontWeight={600}
        >
          {row.yearLabel}
        </text>
      )}
    </g>
  );
}

function zeroedSeries(data: MonthlyReturnPoint[]): MonthlyReturnPoint[] {
  return data.map((d) => ({
    ...d,
    monthlyReturnPct: 0,
    cumulativeReturnPct: 0,
  }));
}

function SummaryKpi({
  label,
  value,
  sub,
  valueClassName,
  isBlue,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
  isBlue: boolean;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3.5 sm:px-5 sm:py-4 min-w-0"
      style={{
        borderColor: isBlue ? "rgba(90,140,220,0.12)" : "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.025)",
      }}
    >
      <div
        className={cn(
          "text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider mb-1.5",
          !isBlue && "text-muted-foreground/50",
        )}
        style={isBlue ? { color: "#64748b" } : undefined}
      >
        {label}
      </div>
      <div className={cn("text-xl sm:text-2xl font-black tabular-nums leading-none", valueClassName)}>
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            "text-[10px] sm:text-[11px] font-medium mt-1.5 tabular-nums",
            !isBlue && "text-muted-foreground/45",
          )}
          style={isBlue ? { color: "#475569" } : undefined}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PerformanceTooltip({
  active,
  payload,
  hasBtc,
  isBlue,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
  hasBtc: boolean;
  isBlue: boolean;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row?.monthKey) return null;

  const ttBg = isBlue ? "#0a1628" : "#1a1a1d";
  const ttBdr = isBlue ? "rgba(90,140,220,0.2)" : "rgba(255,255,255,0.1)";
  const header = format(new Date(`${row.monthKey}-01T12:00:00`), "MMMM yyyy");

  const lines: { label: string; value: number | undefined; color: string }[] = [
    { label: "Fund Monthly pnl (%)", value: row.monthlyReturnPct, color: BRAND_CURVE_STROKE },
    { label: "Fund Cumulative pnl (%)", value: row.cumulativeReturnPct, color: BRAND_CURVE_STROKE },
  ];
  if (hasBtc) {
    lines.push(
      { label: "BTC Monthly pnl (%)", value: row.btcMonthlyReturnPct, color: BTC_LINE },
      { label: "BTC Cumulative pnl (%)", value: row.btcCumulativeReturnPct, color: BTC_LINE },
    );
  }

  return (
    <div
      className="rounded-lg px-3 py-2.5 shadow-lg space-y-1.5 min-w-[210px]"
      style={{
        backgroundColor: ttBg,
        border: `1px solid ${ttBdr}`,
        fontSize: "11px",
      }}
    >
      <div className="text-[#94a3b8] font-semibold pb-1 border-b border-white/[0.06]">{header}</div>
      {lines.map(({ label, value, color }) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <span className="text-[#94a3b8]">{label}</span>
          <span className="font-bold tabular-nums" style={{ color }}>
            {value != null && Number.isFinite(value) ? fmtPct(value, 2) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyReturnCharts({
  trades,
  startingCapital,
  cs = "$",
  theme = "white",
  className,
  showBtcBenchmark = false,
}: MonthlyReturnChartsProps) {
  const isBlue = theme === "blue";
  const motion = useChartMotion();
  const portfolioData = useMemo(
    () => buildMonthlyReturnSeries(trades, startingCapital),
    [trades, startingCapital],
  );
  const chartKey = useMemo(
    () => portfolioData.map((d) => d.monthKey).join("|"),
    [portfolioData],
  );

  const dense = portfolioData.length > 12;

  const [btcPoints, setBtcPoints] = useState<BtcMonthlyReturnPoint[]>([]);
  useEffect(() => {
    if (!showBtcBenchmark || portfolioData.length < 1) {
      setBtcPoints([]);
      return;
    }

    const from = portfolioData[0].monthKey;
    const to = portfolioData[portfolioData.length - 1].monthKey;
    let cancelled = false;

    void fetch(`/api/btc/monthly-returns?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: { points?: BtcMonthlyReturnPoint[] }) => {
        if (!cancelled) setBtcPoints(d.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setBtcPoints([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showBtcBenchmark, chartKey, portfolioData.length]);

  const data = useMemo(
    () => mergeBtcSeries(portfolioData, showBtcBenchmark ? btcPoints : [], dense),
    [portfolioData, btcPoints, showBtcBenchmark, dense],
  );

  const hasBtcData = showBtcBenchmark && data.some((d) => d.btcCumulativeReturnPct != null);
  const lastIndex = Math.max(0, data.length - 1);

  const [displayPortfolio, setDisplayPortfolio] = useState<MonthlyReturnPoint[]>(() =>
    motion.enabled ? zeroedSeries(portfolioData) : portfolioData,
  );
  const [showLabels, setShowLabels] = useState(!motion.enabled);

  useEffect(() => {
    if (!portfolioData.length) return;

    if (!motion.enabled) {
      setDisplayPortfolio(portfolioData);
      setShowLabels(true);
      return;
    }

    setShowLabels(false);
    setDisplayPortfolio(zeroedSeries(portfolioData));

    let labelTimer: number | undefined;
    const growTimer = window.setTimeout(() => {
      setDisplayPortfolio(portfolioData);
      labelTimer = window.setTimeout(() => setShowLabels(true), motion.labelDelay);
    }, 32);

    return () => {
      window.clearTimeout(growTimer);
      if (labelTimer != null) window.clearTimeout(labelTimer);
    };
  }, [chartKey, portfolioData, motion.enabled, motion.labelDelay]);

  const displayData = useMemo(
    () => mergeBtcSeries(displayPortfolio, showBtcBenchmark ? btcPoints : [], dense),
    [displayPortfolio, btcPoints, showBtcBenchmark, dense],
  );

  const { yMin, yMax, totalReturn, btcTotalReturn, alpha, bestMonthPct, bestMonthLabel } = useMemo(() => {
    if (!data.length) {
      return {
        yMin: 0,
        yMax: 10,
        totalReturn: 0,
        btcTotalReturn: null as number | null,
        alpha: null as number | null,
        bestMonthPct: 0,
        bestMonthLabel: "—",
      };
    }
    const cumVals = data.flatMap((d) => {
      const vals = [d.cumulativeReturnPct];
      if (d.btcCumulativeReturnPct != null) vals.push(d.btcCumulativeReturnPct);
      return vals;
    });
    const rawMin = Math.min(...cumVals, 0);
    const rawMax = Math.max(...cumVals, 0);
    const best = data.reduce((a, b) => (b.monthlyReturnPct > a.monthlyReturnPct ? b : a));
    const total = data[data.length - 1].cumulativeReturnPct;
    const lastBtc = [...data].reverse().find((d) => d.btcCumulativeReturnPct != null);
    const btcTotal = lastBtc?.btcCumulativeReturnPct ?? null;
    return {
      yMin: rawMin < 0 ? Math.floor(rawMin / 5) * 5 : 0,
      yMax: niceYMax(rawMax * 1.08),
      totalReturn: total,
      btcTotalReturn: btcTotal,
      alpha: btcTotal != null ? parseFloat((total - btcTotal).toFixed(2)) : null,
      bestMonthPct: best.monthlyReturnPct,
      bestMonthLabel: format(new Date(`${best.monthKey}-01T12:00:00`), "MMMM yyyy"),
    };
  }, [data]);

  const animatedTotal = useAnimatedNumber(totalReturn, { enabled: motion.enabled });
  const animatedAlpha = useAnimatedNumber(alpha ?? 0, { enabled: motion.enabled && alpha != null });
  const animatedBest = useAnimatedNumber(bestMonthPct, { enabled: motion.enabled });
  const anim = motion.enabled
    ? {
        isAnimationActive: true as const,
        animationDuration: motion.duration,
        animationEasing: "ease-out" as const,
      }
    : { isAnimationActive: false as const };

  if (portfolioData.length < 1) return null;

  const gridCol = isBlue ? "rgba(90,140,220,0.06)" : "rgba(255,255,255,0.06)";
  const axisCol = isBlue ? "rgba(90,140,220,0.45)" : "rgba(255,255,255,0.45)";
  const axisLn = isBlue ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.08)";
  const refCol = isBlue ? "rgba(90,140,220,0.15)" : "rgba(255,255,255,0.10)";
  const gradientId = `portfolio-cum-fill-${chartKey.replace(/[^a-z0-9]/gi, "")}`;

  const kpiCols = hasBtcData ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3";

  return (
    <section
      className={cn("rounded-lg border p-4 sm:p-5 space-y-4", className)}
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        borderColor: isBlue ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.06)",
      }}
    >
      <div className="space-y-3">
        <div className="space-y-1 min-w-0">
          <h2
            className={cn(
              "text-sm sm:text-base font-bold tracking-tight text-white",
              isBlue && "text-[#f0f4ff]",
            )}
          >
            {portfolioTitle(portfolioData)}
          </h2>
          <p
            className={cn("text-[11px]", !isBlue && "text-muted-foreground/50")}
            style={isBlue ? { color: "#475569" } : undefined}
          >
            {hasBtcData
              ? "Portfolio vs BTC Buy & Hold (Cumulative Return)"
              : "Cumulative return by calendar month (closed trades)"}
          </p>
        </div>

        <div className={cn("grid gap-3 sm:gap-4", kpiCols)}>
          <SummaryKpi
            label="Total Return"
            value={fmtPct(animatedTotal)}
            valueClassName={brandMetricColor(totalReturn >= 0)}
            isBlue={isBlue}
          />
          {btcTotalReturn != null && (
            <SummaryKpi
              label="vs BTC"
              value={fmtPct(btcTotalReturn)}
              valueClassName="text-orange-400"
              isBlue={isBlue}
            />
          )}
          {alpha != null && (
            <SummaryKpi
              label="Alpha"
              value={fmtPct(animatedAlpha)}
              valueClassName={brandMetricColor(alpha >= 0)}
              isBlue={isBlue}
            />
          )}
          <SummaryKpi
            label="Best Month"
            value={fmtPct(animatedBest)}
            sub={bestMonthLabel}
            valueClassName={brandMetricColor(bestMonthPct >= 0)}
            isBlue={isBlue}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: BRAND_CURVE_STROKE }}
            aria-hidden
          />
          <span
            className={!isBlue ? "text-muted-foreground/70" : undefined}
            style={isBlue ? { color: "#94a3b8" } : undefined}
          >
            Portfolio
          </span>
        </span>
        {hasBtcData && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: BTC_LINE }}
              aria-hidden
            />
            <span
              className={!isBlue ? "text-muted-foreground/70" : undefined}
              style={isBlue ? { color: "#94a3b8" } : undefined}
            >
              BTC Buy & Hold
            </span>
          </span>
        )}
      </div>

      <div className="h-[300px] sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            key={`${chartKey}-${hasBtcData ? "btc" : "solo"}`}
            data={displayData}
            margin={{ top: 12, right: 52, left: 0, bottom: dense ? 18 : 8 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND_CURVE_STROKE} stopOpacity={BRAND_CURVE_FILL_OPACITY.top} />
                <stop offset="100%" stopColor={BRAND_CURVE_STROKE} stopOpacity={BRAND_CURVE_FILL_OPACITY.bottom} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical />
            <XAxis
              dataKey="monthKey"
              interval={xTickInterval(displayData.length)}
              tick={(props) => (
                <MonthYearAxisTick {...props} dense={dense} rows={displayData} />
              )}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              height={dense ? 36 : 28}
            />
            <YAxis
              yAxisId="main"
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              tickFormatter={pctAxis}
              width={44}
            />
            <Tooltip
              content={(props) => (
                <PerformanceTooltip {...props} hasBtc={hasBtcData} isBlue={isBlue} />
              )}
            />
            <ReferenceLine yAxisId="main" y={0} stroke={refCol} strokeWidth={1.5} />

            <Area
              yAxisId="main"
              type="monotone"
              dataKey="cumulativeReturnPct"
              name="Portfolio"
              stroke={BRAND_CURVE_STROKE}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: BRAND_CURVE_STROKE, strokeWidth: 0 }}
              animationId="portfolio-area"
              animationBegin={0}
              {...anim}
            >
              <LabelList
                dataKey="cumulativeReturnPct"
                content={(props) => (
                  <LineEndPctLabel
                    {...props}
                    lastIndex={lastIndex}
                    visible={showLabels}
                    color={BRAND_CURVE_STROKE}
                    dx={8}
                  />
                )}
              />
            </Area>

            {hasBtcData && (
              <Line
                yAxisId="main"
                type="monotone"
                dataKey="btcCumulativeReturnPct"
                name="BTC Buy & Hold"
                stroke={BTC_LINE}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 3, fill: BTC_LINE, strokeWidth: 0 }}
                connectNulls
                animationId="btc-line"
                animationBegin={motion.enabled ? 120 : 0}
                {...anim}
              >
                <LabelList
                  dataKey="btcCumulativeReturnPct"
                  content={(props) => (
                    <LineEndPctLabel
                      {...props}
                      lastIndex={lastIndex}
                      visible={showLabels}
                      color={BTC_LINE}
                      dx={8}
                      dy={14}
                    />
                  )}
                />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
