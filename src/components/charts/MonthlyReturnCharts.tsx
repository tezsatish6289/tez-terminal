"use client";

import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { buildMonthlyReturnSeries } from "@/lib/monthly-returns";
import type { ClosedTradeLike } from "@/lib/equity-curve";

export interface MonthlyReturnChartsProps {
  trades: ClosedTradeLike[];
  startingCapital: number;
  cs?: string;
  theme?: "blue" | "white";
  className?: string;
}

function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pctAxis(v: number): string {
  if (v === 0) return "0%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(0)}%`;
}

function MonthlyBarChart({
  title,
  dataKey,
  data,
  isBlue,
  cs,
  tooltipLabel,
}: {
  title: string;
  dataKey: "monthlyReturnPct" | "cumulativeReturnPct";
  data: ReturnType<typeof buildMonthlyReturnSeries>;
  isBlue: boolean;
  cs: string;
  tooltipLabel: string;
}) {
  const values = data.map((d) => d[dataKey]);
  const yMax = values.length
    ? Math.ceil(Math.max(...values.map((v) => Math.abs(v)), 1) * 1.15)
    : 10;

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
    labelStyle: { color: "#94a3b8", marginBottom: "2px" },
    itemStyle: { color: "#e2e8f0" },
  };

  return (
    <div
      className="rounded-lg border p-4 space-y-3 flex flex-col min-w-0"
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        borderColor: isBlue ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.06)",
      }}
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          !isBlue && "text-muted-foreground/55",
        )}
        style={isBlue ? { color: "#475569" } : undefined}
      >
        {title}
      </span>
      <div className="h-[200px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[-yMax, yMax]}
              tick={{ fontSize: 9, fill: axisCol }}
              tickLine={false}
              axisLine={{ stroke: axisLn }}
              tickFormatter={pctAxis}
              width={44}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number, _name, props) => {
                const row = props.payload as (typeof data)[0];
                const money =
                  cs === "₹"
                    ? `₹${Math.abs(row.monthPnl).toLocaleString("en-IN")}`
                    : `$${Math.abs(row.monthPnl).toFixed(2)}`;
                return [
                  fmtPct(value),
                  dataKey === "monthlyReturnPct"
                    ? `${tooltipLabel} · ${row.monthPnl >= 0 ? "+" : ""}${money} net`
                    : tooltipLabel,
                ];
              }}
            />
            <ReferenceLine y={0} stroke={refCol} />
            <Bar dataKey={dataKey} maxBarSize={28} radius={[2, 2, 0, 0]} activeBar={false}>
              {data.map((entry, i) => {
                const v = entry[dataKey];
                const fill =
                  dataKey === "cumulativeReturnPct"
                    ? v >= 0
                      ? "#34d399"
                      : "#f87171"
                    : v >= 0
                      ? "#34d399"
                      : "#f87171";
                return <Cell key={i} fill={fill} fillOpacity={0.75} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
}: MonthlyReturnChartsProps) {
  const isBlue = theme === "blue";
  const data = useMemo(
    () => buildMonthlyReturnSeries(trades, startingCapital),
    [trades, startingCapital],
  );

  if (data.length < 1) return null;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <CalendarRange
          className="w-4 h-4 shrink-0"
          style={isBlue ? { color: "#60a5fa" } : undefined}
        />
        <h2
          className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            !isBlue && "text-muted-foreground/75",
          )}
          style={isBlue ? { color: "#64748b" } : undefined}
        >
          Monthly returns
        </h2>
        <span
          className={cn(
            "text-[9px]",
            !isBlue && "text-muted-foreground/40",
          )}
          style={isBlue ? { color: "#334155" } : undefined}
        >
          · calendar months · closed trades
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthlyBarChart
          title="Monthly return %"
          dataKey="monthlyReturnPct"
          data={data}
          isBlue={isBlue}
          cs={cs}
          tooltipLabel="Month return"
        />
        <MonthlyBarChart
          title="Cumulative return %"
          dataKey="cumulativeReturnPct"
          data={data}
          isBlue={isBlue}
          cs={cs}
          tooltipLabel="Total vs start"
        />
      </div>
    </section>
  );
}
