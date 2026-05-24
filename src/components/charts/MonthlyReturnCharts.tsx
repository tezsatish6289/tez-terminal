"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ClosedTradeLike } from "@/lib/equity-curve";
import { useAnimatedNumber, useChartMotion } from "@/hooks/use-chart-motion";
import { brandMetricColor } from "@/lib/chart-brand-colors";

export interface MonthlyReturnChartsProps {
  trades: ClosedTradeLike[];
  startingCapital: number;
  cs?: string;
  theme?: "blue" | "white";
  className?: string;
}

const MONTHLY_BAR = "#2dd4bf";
const CUMULATIVE_BAR = "#3b82f6";

type ChartRow = MonthlyReturnPoint;

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

/** High-contrast pill label above each bar */
function BarPctLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  visible?: boolean;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value, visible = true } = props;
  if (!visible || value == null || !Number.isFinite(value)) return null;

  const label = fmtPct(value);
  const pillW = Math.max(46, label.length * 7.2);
  const cx = x + width / 2;
  const positive = height >= 0;
  const pillY = positive ? y - 20 : y + height - 6;
  const textY = positive ? y - 9 : y + height + 5;

  return (
    <g>
      <rect
        x={cx - pillW / 2}
        y={pillY}
        width={pillW}
        height={14}
        rx={4}
        fill="rgba(15,15,17,0.94)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={textY}
        fill="#ffffff"
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

function zeroedSeries(data: ChartRow[]): ChartRow[] {
  return data.map((d) => ({
    ...d,
    monthlyReturnPct: 0,
    cumulativeReturnPct: 0,
  }));
}

export function MonthlyReturnCharts({
  trades,
  startingCapital,
  cs = "$",
  theme = "white",
  className,
}: MonthlyReturnChartsProps) {
  const isBlue = theme === "blue";
  const motion = useChartMotion();
  const data = useMemo(
    () => buildMonthlyReturnSeries(trades, startingCapital),
    [trades, startingCapital],
  );
  const chartKey = useMemo(() => data.map((d) => d.monthKey).join("|"), [data]);

  const [displayData, setDisplayData] = useState<ChartRow[]>(() =>
    motion.enabled ? zeroedSeries(data) : data,
  );
  const [showBarLabels, setShowBarLabels] = useState(!motion.enabled);

  useEffect(() => {
    if (!data.length) return;

    if (!motion.enabled) {
      setDisplayData(data);
      setShowBarLabels(true);
      return;
    }

    setShowBarLabels(false);
    setDisplayData(zeroedSeries(data));

    let labelTimer: number | undefined;
    const growTimer = window.setTimeout(() => {
      setDisplayData(data);
      labelTimer = window.setTimeout(() => setShowBarLabels(true), motion.labelDelay);
    }, 32);

    return () => {
      window.clearTimeout(growTimer);
      if (labelTimer != null) window.clearTimeout(labelTimer);
    };
  }, [chartKey, data, motion.enabled, motion.labelDelay]);

  const { yMin, yMax, totalReturn, bestMonth } = useMemo(() => {
    if (!data.length) {
      return { yMin: 0, yMax: 10, totalReturn: 0, bestMonth: "—" };
    }
    const allPct = data.flatMap((d) => [d.monthlyReturnPct, d.cumulativeReturnPct]);
    const rawMin = Math.min(...allPct, 0);
    const rawMax = Math.max(...allPct, 0);
    const best = data.reduce((a, b) =>
      b.monthlyReturnPct > a.monthlyReturnPct ? b : a,
    );
    return {
      yMin: rawMin < 0 ? Math.floor(rawMin * 1.1) : 0,
      yMax: Math.ceil(Math.max(rawMax, 1) * 1.12),
      totalReturn: data[data.length - 1].cumulativeReturnPct,
      bestMonth: format(new Date(`${best.monthKey}-01T12:00:00`), "MMMM"),
    };
  }, [data]);

  const animatedTotal = useAnimatedNumber(totalReturn, { enabled: motion.enabled });
  const anim = motion.enabled
    ? {
        isAnimationActive: true as const,
        animationDuration: motion.duration,
        animationEasing: "ease-out" as const,
      }
    : { isAnimationActive: false as const };

  if (data.length < 1) return null;

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2
            className={cn(
              "text-sm sm:text-base font-bold tracking-tight text-white",
              isBlue && "text-[#f0f4ff]",
            )}
          >
            {portfolioTitle(data)}
          </h2>
          <p
            className={cn("text-[11px]", !isBlue && "text-muted-foreground/50")}
            style={isBlue ? { color: "#475569" } : undefined}
          >
            Monthly vs Cumulative Returns (Closed Trades)
          </p>
        </div>
        <div
          className="shrink-0 rounded-lg border px-3 py-2 text-[10px] sm:text-[11px] leading-snug"
          style={{
            borderColor: isBlue ? "rgba(90,140,220,0.15)" : "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.03)",
          }}
        >
          <span
            className={!isBlue ? "text-muted-foreground/55" : undefined}
            style={isBlue ? { color: "#64748b" } : undefined}
          >
            Total Return:{" "}
          </span>
          <span
            className={cn(
              "font-bold",
              brandMetricColor(totalReturn >= 0),
            )}
          >
            {fmtPct(animatedTotal)}
          </span>
          <span
            className={cn("mx-1.5", !isBlue && "text-muted-foreground/35")}
            style={isBlue ? { color: "#334155" } : undefined}
          >
            |
          </span>
          <span
            className={!isBlue ? "text-muted-foreground/55" : undefined}
            style={isBlue ? { color: "#64748b" } : undefined}
          >
            Best Month:{" "}
          </span>
          <span className="font-semibold text-white/90">{bestMonth}</span>
        </div>
      </div>

      <div className="h-[300px] sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            key={chartKey}
            data={displayData}
            margin={{ top: 36, right: 12, left: 4, bottom: 4 }}
            barCategoryGap="18%"
            barGap={4}
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
                const row = props.payload as MonthlyReturnPoint;
                const money =
                  cs === "₹"
                    ? `₹${Math.abs(row.monthPnl).toLocaleString("en-IN")}`
                    : `$${Math.abs(row.monthPnl).toFixed(2)}`;
                if (name === "Monthly Return") {
                  return [fmtPct(value, 2), `Monthly · ${row.monthPnl >= 0 ? "+" : ""}${money}`];
                }
                if (name === "Cumulative Return") {
                  return [fmtPct(value, 2), "Cumulative vs start"];
                }
                return [fmtPct(value, 2), name];
              }}
            />
            <ReferenceLine yAxisId="main" y={0} stroke={refCol} strokeWidth={1.5} />

            <Bar
              yAxisId="main"
              dataKey="monthlyReturnPct"
              name="Monthly Return"
              barSize={26}
              radius={[4, 4, 0, 0]}
              activeBar={false}
              animationId="monthly"
              animationBegin={0}
              {...anim}
            >
              {displayData.map((entry, i) => (
                <Cell
                  key={`m-${i}`}
                  fill={entry.monthlyReturnPct >= 0 ? MONTHLY_BAR : "#f87171"}
                  fillOpacity={0.9}
                />
              ))}
              <LabelList
                dataKey="monthlyReturnPct"
                content={(props) => <BarPctLabel {...props} visible={showBarLabels} />}
              />
            </Bar>

            <Bar
              yAxisId="main"
              dataKey="cumulativeReturnPct"
              name="Cumulative Return"
              barSize={26}
              radius={[4, 4, 0, 0]}
              fill={CUMULATIVE_BAR}
              fillOpacity={0.9}
              activeBar={false}
              animationId="cumulative"
              animationBegin={motion.enabled ? 100 : 0}
              {...anim}
            >
              {displayData.map((entry, i) => (
                <Cell
                  key={`c-${i}`}
                  fill={entry.cumulativeReturnPct >= 0 ? CUMULATIVE_BAR : "#f87171"}
                  fillOpacity={0.9}
                />
              ))}
              <LabelList
                dataKey="cumulativeReturnPct"
                content={(props) => <BarPctLabel {...props} visible={showBarLabels} />}
              />
            </Bar>

            <Line
              yAxisId="main"
              type="monotone"
              dataKey="cumulativeReturnPct"
              stroke={CUMULATIVE_BAR}
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              legendType="none"
              tooltipType="none"
              animationId="cumulative-line"
              animationBegin={motion.enabled ? 200 : 0}
              {...anim}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: MONTHLY_BAR }}
            aria-hidden
          />
          <span
            className={!isBlue ? "text-muted-foreground/70" : undefined}
            style={isBlue ? { color: "#94a3b8" } : undefined}
          >
            Monthly Return
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: CUMULATIVE_BAR }}
            aria-hidden
          />
          <span
            className={!isBlue ? "text-muted-foreground/70" : undefined}
            style={isBlue ? { color: "#94a3b8" } : undefined}
          >
            Cumulative Return
          </span>
        </span>
        <span
          className={cn("text-[9px] font-normal", !isBlue && "text-muted-foreground/40")}
          style={isBlue ? { color: "#475569" } : undefined}
        >
          Blue line connects cumulative bar peaks
        </span>
      </div>
    </section>
  );
}
