"use client";

import { useMemo } from "react";
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

export interface MonthlyReturnChartsProps {
  trades: ClosedTradeLike[];
  startingCapital: number;
  cs?: string;
  theme?: "blue" | "white";
  className?: string;
}

const MONTHLY_BAR = "#2dd4bf";
const CUMULATIVE_LINE = "#3b82f6";

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

function BarValueLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (value == null || !Number.isFinite(value)) return null;
  const inside = Math.abs(height) > 18;
  const cy = y + height / 2;
  return (
    <text
      x={x + width / 2}
      y={cy}
      fill={inside ? "#042f2e" : "#e2e8f0"}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={10}
      fontWeight={700}
    >
      {fmtPct(value)}
    </text>
  );
}

function LineValueLabel(props: {
  x?: number;
  y?: number;
  value?: number;
}) {
  const { x = 0, y = 0, value } = props;
  if (value == null || !Number.isFinite(value)) return null;
  const label = fmtPct(value);
  const w = Math.max(40, label.length * 6.5);
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - 22}
        width={w}
        height={16}
        rx={4}
        fill="#0f0f11"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
      <text
        x={x}
        y={y - 11}
        fill="#f8fafc"
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

export function MonthlyReturnCharts({
  trades,
  startingCapital,
  cs = "$",
  theme = "white",
  className,
}: MonthlyReturnChartsProps) {
  const isBlue = theme === "blue";
  const data = useMemo(
    () => buildMonthlyReturnSeries(trades, startingCapital),
    [trades, startingCapital],
  );

  const { monthlyMax, cumulativeMax, totalReturn, bestMonth } = useMemo(() => {
    if (!data.length) {
      return { monthlyMax: 10, cumulativeMax: 10, totalReturn: 0, bestMonth: "—" };
    }
    const monthlyVals = data.map((d) => d.monthlyReturnPct);
    const cumVals = data.map((d) => d.cumulativeReturnPct);
    const best = data.reduce((a, b) =>
      b.monthlyReturnPct > a.monthlyReturnPct ? b : a,
    );
    return {
      monthlyMax: Math.ceil(Math.max(...monthlyVals.map(Math.abs), 1) * 1.2),
      cumulativeMax: Math.ceil(Math.max(...cumVals.map(Math.abs), 1) * 1.15),
      totalReturn: data[data.length - 1].cumulativeReturnPct,
      bestMonth: format(new Date(`${best.monthKey}-01T12:00:00`), "MMMM"),
    };
  }, [data]);

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

  const cumDomainMin = Math.min(0, ...data.map((d) => d.cumulativeReturnPct));
  const cumDomainMax = Math.max(0, ...data.map((d) => d.cumulativeReturnPct));

  return (
    <section
      className={cn(
        "rounded-lg border p-4 sm:p-5 space-y-4",
        className,
      )}
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        borderColor: isBlue ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
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
            className={cn(
              "text-[11px]",
              !isBlue && "text-muted-foreground/50",
            )}
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
          <span style={{ color: isBlue ? "#64748b" : undefined }} className={!isBlue ? "text-muted-foreground/55" : undefined}>
            Total Return:{" "}
          </span>
          <span
            className={cn(
              "font-bold",
              totalReturn >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {fmtPct(totalReturn)}
          </span>
          <span className={cn("mx-1.5", !isBlue && "text-muted-foreground/35")} style={isBlue ? { color: "#334155" } : undefined}>
            |
          </span>
          <span style={{ color: isBlue ? "#64748b" : undefined }} className={!isBlue ? "text-muted-foreground/55" : undefined}>
            Best Month:{" "}
          </span>
          <span className="font-semibold text-white/90">{bestMonth}</span>
        </div>
      </div>

      {/* Combo chart */}
      <div className="h-[280px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 28, right: 8, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
            />
            <YAxis
              yAxisId="monthly"
              orientation="left"
              domain={[-monthlyMax, monthlyMax]}
              tick={{ fontSize: 9, fill: MONTHLY_BAR }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              tickFormatter={pctAxis}
              width={48}
              label={{
                value: "Monthly Return %",
                angle: -90,
                position: "insideLeft",
                offset: 12,
                style: { fill: MONTHLY_BAR, fontSize: 9, fontWeight: 600 },
              }}
            />
            <YAxis
              yAxisId="cumulative"
              orientation="right"
              domain={[
                cumDomainMin < 0 ? Math.floor(cumDomainMin * 1.1) : 0,
                Math.ceil(cumDomainMax * 1.12) || cumulativeMax,
              ]}
              tick={{ fontSize: 9, fill: CUMULATIVE_LINE }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              tickFormatter={pctAxis}
              width={52}
              label={{
                value: "Cumulative Return %",
                angle: 90,
                position: "insideRight",
                offset: 12,
                style: { fill: CUMULATIVE_LINE, fontSize: 9, fontWeight: 600 },
              }}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number, name: string, props) => {
                const row = props.payload as MonthlyReturnPoint;
                const money =
                  cs === "₹"
                    ? `₹${Math.abs(row.monthPnl).toLocaleString("en-IN")}`
                    : `$${Math.abs(row.monthPnl).toFixed(2)}`;
                if (name === "monthlyReturnPct") {
                  return [fmtPct(value, 2), `Monthly · ${row.monthPnl >= 0 ? "+" : ""}${money}`];
                }
                return [fmtPct(value, 2), "Cumulative vs start"];
              }}
            />
            <ReferenceLine yAxisId="monthly" y={0} stroke={refCol} />
            <Bar
              yAxisId="monthly"
              dataKey="monthlyReturnPct"
              maxBarSize={56}
              radius={[4, 4, 0, 0]}
              activeBar={false}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.monthlyReturnPct >= 0 ? MONTHLY_BAR : "#f87171"}
                  fillOpacity={0.85}
                />
              ))}
              <LabelList dataKey="monthlyReturnPct" content={BarValueLabel} />
            </Bar>
            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey="cumulativeReturnPct"
              stroke={CUMULATIVE_LINE}
              strokeWidth={2.5}
              dot={{
                r: 5,
                fill: CUMULATIVE_LINE,
                stroke: "#0f0f11",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                fill: CUMULATIVE_LINE,
                stroke: "#fff",
                strokeWidth: 2,
              }}
            >
              <LabelList dataKey="cumulativeReturnPct" content={LineValueLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: MONTHLY_BAR }}
            aria-hidden
          />
          <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
            Monthly Return
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: CUMULATIVE_LINE }}
            aria-hidden
          />
          <span className={!isBlue ? "text-muted-foreground/70" : undefined} style={isBlue ? { color: "#94a3b8" } : undefined}>
            Cumulative Return
          </span>
        </span>
      </div>
    </section>
  );
}
