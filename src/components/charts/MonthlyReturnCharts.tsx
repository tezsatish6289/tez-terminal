"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { format } from "date-fns";
import {
  Bar,
  CartesianGrid,
  Cell,
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
import { brandMetricColor } from "@/lib/chart-brand-colors";

export interface MonthlyReturnChartsProps {
  trades: ClosedTradeLike[];
  startingCapital: number;
  cs?: string;
  theme?: "blue" | "white";
  className?: string;
  /** Overlay BTC buy-and-hold benchmark (CRYPTO stats only). */
  showBtcBenchmark?: boolean;
}

const PORTFOLIO_MONTHLY = "#34d399";
const CUMULATIVE_LINE = "#3b82f6";
const BTC_MONTHLY = "#F7931A";
const BTC_CUMULATIVE = "#F7931A";
const NEGATIVE_BAR = "#f87171";

type ChartRow = MonthlyReturnPoint & {
  btcMonthlyReturnPct?: number;
  btcCumulativeReturnPct?: number;
};

function fmtPct(v: number, dp = 1): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(dp)}%`;
}

function pctAxis(v: number): string {
  if (v === 0) return "0%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(0)}%`;
}

function portfolioTitle(data: MonthlyReturnPoint[]): string {
  if (!data.length) return "Portfolio Performance Summary";
  const y0 = data[0].monthKey.slice(0, 4);
  const y1 = data[data.length - 1].monthKey.slice(0, 4);
  const m0 = format(new Date(`${data[0].monthKey}-01T12:00:00`), "MMMM");
  const m1 = format(new Date(`${data[data.length - 1].monthKey}-01T12:00:00`), "MMMM");
  const year = y0 === y1 ? y0 : `${y0}–${y1}`;
  return `Portfolio Performance Summary — ${m0} to ${m1} ${year}`;
}

/** Callout bubble — above bar when +, below bar when −. Works at any bar height. */
function CalloutBarLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  visible?: boolean;
  accentColor?: string;
  textColor?: string;
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    value,
    visible = true,
    accentColor = PORTFOLIO_MONTHLY,
    textColor = "#ffffff",
  } = props;
  if (!visible || value == null || !Number.isFinite(value)) return null;

  const positive = value >= 0;
  const cx = x + width / 2;
  const h = height;
  const absH = Math.abs(h);
  const barTop = h >= 0 ? y : y + h;
  const barBottom = h >= 0 ? y + absH : y;

  const label = fmtPct(value, 1);
  const bubbleW = Math.max(44, label.length * 6.8 + 14);
  const bubbleH = 18;
  const tail = 5;
  const gap = 3;

  const bubbleY = positive ? barTop - bubbleH - tail - gap : barBottom + tail + gap;
  const textY = bubbleY + bubbleH / 2 + 3.5;

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={cx - bubbleW / 2}
        y={bubbleY}
        width={bubbleW}
        height={bubbleH}
        rx={5}
        fill="rgba(12,12,14,0.97)"
        stroke={positive ? accentColor : NEGATIVE_BAR}
        strokeWidth={1.5}
      />
      {positive ? (
        <path
          d={`M ${cx - 4} ${bubbleY + bubbleH} L ${cx + 4} ${bubbleY + bubbleH} L ${cx} ${bubbleY + bubbleH + tail} Z`}
          fill="rgba(12,12,14,0.97)"
          stroke={accentColor}
          strokeWidth={1}
        />
      ) : (
        <path
          d={`M ${cx - 4} ${bubbleY} L ${cx + 4} ${bubbleY} L ${cx} ${bubbleY - tail} Z`}
          fill="rgba(12,12,14,0.97)"
          stroke={NEGATIVE_BAR}
          strokeWidth={1}
        />
      )}
      <text
        x={cx}
        y={textY}
        textAnchor="middle"
        fill={textColor}
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

/** End-of-line callout for cumulative series (portfolio + BTC). */
function CumulativeEndLabel(props: {
  x?: number;
  y?: number;
  value?: number;
  index?: number;
  lastIndex?: number;
  visible?: boolean;
  accentColor?: string;
  align?: "left" | "right";
  yOffset?: number;
}) {
  const {
    x = 0,
    y = 0,
    value,
    index = 0,
    lastIndex = 0,
    visible = true,
    accentColor = CUMULATIVE_LINE,
    align = "right",
    yOffset = 0,
  } = props;
  if (!visible || index !== lastIndex || value == null || !Number.isFinite(value)) return null;

  const label = fmtPct(value, 1);
  const bubbleW = Math.max(48, label.length * 6.8 + 16);
  const bubbleH = 18;
  const tail = 5;
  const offsetX = align === "right" ? 10 : -10;
  const bubbleX = align === "right" ? x + offsetX : x - bubbleW - offsetX;
  const anchorY = y + yOffset;
  const bubbleY = anchorY - bubbleH / 2;

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={bubbleX}
        y={bubbleY}
        width={bubbleW}
        height={bubbleH}
        rx={5}
        fill="rgba(12,12,14,0.97)"
        stroke={accentColor}
        strokeWidth={1.5}
      />
      <path
        d={
          align === "right"
            ? `M ${bubbleX} ${anchorY} L ${bubbleX - tail} ${anchorY - 3} L ${bubbleX - tail} ${anchorY + 3} Z`
            : `M ${bubbleX + bubbleW} ${anchorY} L ${bubbleX + bubbleW + tail} ${anchorY - 3} L ${bubbleX + bubbleW + tail} ${anchorY + 3} Z`
        }
        fill="rgba(12,12,14,0.97)"
        stroke={accentColor}
        strokeWidth={1}
      />
      <text
        x={bubbleX + bubbleW / 2}
        y={bubbleY + bubbleH / 2 + 3.5}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
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

function mergeBtcSeries(
  portfolio: MonthlyReturnPoint[],
  btcPoints: BtcMonthlyReturnPoint[],
): ChartRow[] {
  const btcMap = new Map(btcPoints.map((p) => [p.monthKey, p]));
  return portfolio.map((row) => {
    const btc = btcMap.get(row.monthKey);
    if (!btc) return row;
    return {
      ...row,
      btcMonthlyReturnPct: btc.btcMonthlyReturnPct,
      btcCumulativeReturnPct: btc.btcCumulativeReturnPct,
    };
  });
}

function SummaryKpi({
  label,
  value,
  valueClassName,
  valueStyle,
  highlight,
  isBlue,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  valueStyle?: CSSProperties;
  highlight?: boolean;
  isBlue: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 min-w-0",
        highlight && "ring-1 ring-emerald-500/25",
      )}
      style={{
        borderColor: isBlue ? "rgba(90,140,220,0.12)" : "rgba(255,255,255,0.08)",
        backgroundColor: highlight ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
      }}
    >
      <div
        className={cn("text-[9px] font-semibold uppercase tracking-wider mb-1", !isBlue && "text-muted-foreground/50")}
        style={isBlue ? { color: "#64748b" } : undefined}
      >
        {label}
      </div>
      <div
        className={cn("text-sm sm:text-base font-black tabular-nums truncate", valueClassName)}
        style={valueStyle}
      >
        {value}
      </div>
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
    () => mergeBtcSeries(portfolioData, showBtcBenchmark ? btcPoints : []),
    [portfolioData, btcPoints, showBtcBenchmark],
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
    () => mergeBtcSeries(displayPortfolio, showBtcBenchmark ? btcPoints : []),
    [displayPortfolio, btcPoints, showBtcBenchmark],
  );

  const { yMin, yMax, totalReturn, btcTotalReturn, alpha, bestMonth } = useMemo(() => {
    if (!data.length) {
      return {
        yMin: 0,
        yMax: 10,
        totalReturn: 0,
        btcTotalReturn: null as number | null,
        alpha: null as number | null,
        bestMonth: "—",
      };
    }
    const allPct = data.flatMap((d) => {
      const vals = [d.monthlyReturnPct, d.cumulativeReturnPct];
      if (d.btcMonthlyReturnPct != null) vals.push(d.btcMonthlyReturnPct);
      if (d.btcCumulativeReturnPct != null) vals.push(d.btcCumulativeReturnPct);
      return vals;
    });
    const rawMin = Math.min(...allPct, 0);
    const rawMax = Math.max(...allPct, 0);
    const best = data.reduce((a, b) =>
      b.monthlyReturnPct > a.monthlyReturnPct ? b : a,
    );
    const total = data[data.length - 1].cumulativeReturnPct;
    const lastBtc = [...data].reverse().find((d) => d.btcCumulativeReturnPct != null);
    const btcTotal = lastBtc?.btcCumulativeReturnPct ?? null;
    return {
      yMin: rawMin < 0 ? Math.floor(rawMin * 1.15) : 0,
      yMax: Math.ceil(Math.max(rawMax, 1) * 1.15),
      totalReturn: total,
      btcTotalReturn: btcTotal,
      alpha: btcTotal != null ? parseFloat((total - btcTotal).toFixed(2)) : null,
      bestMonth: format(new Date(`${best.monthKey}-01T12:00:00`), "MMMM"),
    };
  }, [data]);

  const animatedTotal = useAnimatedNumber(totalReturn, { enabled: motion.enabled });
  const animatedAlpha = useAnimatedNumber(alpha ?? 0, { enabled: motion.enabled && alpha != null });
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
  const ttBg = isBlue ? "#0a1628" : "#1a1a1d";
  const ttBdr = isBlue ? "rgba(90,140,220,0.2)" : "rgba(255,255,255,0.1)";

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: ttBg,
      border: `1px solid ${ttBdr}`,
      borderRadius: "8px",
      fontSize: "11px",
      color: "#e2e8f0",
    },
    labelStyle: { color: "#94a3b8", marginBottom: "4px" },
    itemStyle: { color: "#e2e8f0" },
  };

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
              ? "Portfolio vs BTC buy & hold (monthly open → close)"
              : "Monthly returns with cumulative trend (closed trades)"}
          </p>
        </div>

        <div className={cn("grid gap-2 sm:gap-3", hasBtcData ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
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
              valueStyle={{ color: BTC_CUMULATIVE }}
              isBlue={isBlue}
            />
          )}
          {alpha != null && (
            <SummaryKpi
              label="Alpha"
              value={fmtPct(animatedAlpha)}
              valueClassName={brandMetricColor(alpha >= 0)}
              highlight
              isBlue={isBlue}
            />
          )}
          <SummaryKpi
            label="Best Month"
            value={bestMonth}
            valueClassName="text-white/90"
            isBlue={isBlue}
          />
        </div>
      </div>

      <div className="h-[300px] sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            key={`${chartKey}-${hasBtcData ? "btc" : "solo"}`}
            data={displayData}
            margin={{ top: 28, right: hasBtcData ? 72 : 56, left: 4, bottom: 4 }}
            barCategoryGap={hasBtcData ? "36%" : "28%"}
            barGap={hasBtcData ? 12 : 8}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
            />
            <YAxis
              yAxisId="main"
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              tickFormatter={pctAxis}
              width={48}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number, name: string, props) => {
                const row = props.payload as ChartRow;
                const money =
                  cs === "₹"
                    ? `₹${Math.abs(row.monthPnl).toLocaleString("en-IN")}`
                    : `$${Math.abs(row.monthPnl).toFixed(2)}`;
                if (name === "Portfolio Monthly") {
                  return [fmtPct(value, 2), `Portfolio monthly · ${row.monthPnl >= 0 ? "+" : ""}${money}`];
                }
                if (name === "Portfolio Cumulative") {
                  return [fmtPct(value, 2), "Portfolio cumulative vs start"];
                }
                if (name === "BTC Monthly") {
                  return [fmtPct(value, 2), "BTC monthly (open → close)"];
                }
                if (name === "BTC Cumulative") {
                  return [fmtPct(value, 2), "BTC buy & hold vs period start"];
                }
                return [fmtPct(value, 2), name];
              }}
            />
            <ReferenceLine yAxisId="main" y={0} stroke={refCol} strokeWidth={1.5} />

            <Line
              yAxisId="main"
              type="monotone"
              dataKey="cumulativeReturnPct"
              name="Portfolio Cumulative"
              stroke={CUMULATIVE_LINE}
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              animationId="cumulative-line"
              animationBegin={motion.enabled ? 180 : 0}
              {...anim}
            >
              <LabelList
                dataKey="cumulativeReturnPct"
                content={(props) => (
                  <CumulativeEndLabel
                    {...props}
                    lastIndex={lastIndex}
                    visible={showLabels}
                    accentColor={CUMULATIVE_LINE}
                    align="right"
                  />
                )}
              />
            </Line>

            {hasBtcData && (
              <Line
                yAxisId="main"
                type="monotone"
                dataKey="btcCumulativeReturnPct"
                name="BTC Cumulative"
                stroke={BTC_CUMULATIVE}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                connectNulls
                animationId="btc-cumulative-line"
                animationBegin={motion.enabled ? 220 : 0}
                {...anim}
              >
                <LabelList
                  dataKey="btcCumulativeReturnPct"
                  content={(props) => (
                  <CumulativeEndLabel
                    {...props}
                    lastIndex={lastIndex}
                    visible={showLabels}
                    accentColor={BTC_CUMULATIVE}
                    align="right"
                    yOffset={22}
                  />
                  )}
                />
              </Line>
            )}

            <Bar
              yAxisId="main"
              dataKey="monthlyReturnPct"
              name="Portfolio Monthly"
              barSize={hasBtcData ? 28 : 32}
              radius={[4, 4, 0, 0]}
              activeBar={false}
              animationId="monthly"
              animationBegin={0}
              {...anim}
            >
              {displayData.map((entry, i) => (
                <Cell
                  key={`m-${i}`}
                  fill={entry.monthlyReturnPct >= 0 ? PORTFOLIO_MONTHLY : NEGATIVE_BAR}
                  fillOpacity={0.92}
                />
              ))}
              <LabelList
                dataKey="monthlyReturnPct"
                content={(props) => (
                  <CalloutBarLabel
                    {...props}
                    visible={showLabels}
                    accentColor={PORTFOLIO_MONTHLY}
                  />
                )}
              />
            </Bar>

            {hasBtcData && (
              <Bar
                yAxisId="main"
                dataKey="btcMonthlyReturnPct"
                name="BTC Monthly"
                barSize={28}
                radius={[4, 4, 0, 0]}
                activeBar={false}
                animationId="btc-monthly"
                animationBegin={motion.enabled ? 80 : 0}
                {...anim}
              >
                {displayData.map((entry, i) => (
                  <Cell
                    key={`btc-m-${i}`}
                    fill={
                      entry.btcMonthlyReturnPct == null
                        ? "transparent"
                        : entry.btcMonthlyReturnPct >= 0
                          ? BTC_MONTHLY
                          : NEGATIVE_BAR
                    }
                    fillOpacity={entry.btcMonthlyReturnPct == null ? 0 : 0.92}
                  />
                ))}
                <LabelList
                  dataKey="btcMonthlyReturnPct"
                  content={(props) => (
                    <CalloutBarLabel
                      {...props}
                      visible={showLabels}
                      accentColor={BTC_MONTHLY}
                    />
                  )}
                />
              </Bar>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: PORTFOLIO_MONTHLY }} aria-hidden />
          <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
            Portfolio Monthly
          </span>
        </span>
        {hasBtcData && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: BTC_MONTHLY }} aria-hidden />
            <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
              BTC Monthly
            </span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: CUMULATIVE_LINE }} aria-hidden />
          <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
            Portfolio Cumulative
          </span>
        </span>
        {hasBtcData && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 shrink-0 border-t-2 border-dashed"
              style={{ borderColor: BTC_CUMULATIVE }}
              aria-hidden
            />
            <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
              BTC Cumulative
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
