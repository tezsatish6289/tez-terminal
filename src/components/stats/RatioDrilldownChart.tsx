"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart } from "lucide-react";
import type { RatioSeriesPoint } from "@/lib/performance-metrics";

export type RatioKey = "sharpe" | "sortino" | "calmar";

const RATIO_LABELS: Record<RatioKey, string> = {
  sharpe: "Sharpe Ratio",
  sortino: "Sortino Ratio",
  calmar: "Calmar Ratio",
};

interface RatioDrilldownChartProps {
  ratioKey: RatioKey;
  series: RatioSeriesPoint[];
  view: "trade" | "day";
  headlineValue: number | null;
}

function fmtRatio(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function ratioColor(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "#94a3b8";
  if (n >= 1.5) return "#34d399";
  if (n >= 0.5) return "#fbbf24";
  return "#f87171";
}

export function RatioDrilldownChart({
  ratioKey,
  series,
  view,
  headlineValue,
}: RatioDrilldownChartProps) {
  const chartData = useMemo(
    () =>
      series
        .map((p) => ({
          x: p.x,
          value: p[ratioKey],
          tooltip: p.tooltip,
        }))
        .filter((d) => d.value != null),
    [series, ratioKey],
  );

  const values = chartData.map((d) => d.value as number);
  const yMin = values.length
    ? Math.floor(Math.min(...values, 0) * 10) / 10 - 0.25
    : -1;
  const yMax = values.length
    ? Math.ceil(Math.max(...values, 1) * 10) / 10 + 0.25
    : 3;
  const stroke = ratioColor(headlineValue);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1a1a1d",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      fontSize: "11px",
      color: "#e2e8f0",
    },
    labelStyle: { color: "#94a3b8", marginBottom: "2px" },
    itemStyle: { color: "#e2e8f0" },
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-6 py-6 flex flex-col gap-5 h-full min-h-[340px]">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <LineChart className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {RATIO_LABELS[ratioKey]}
            </span>
          </div>
          <span
            className="text-2xl font-mono font-black tabular-nums leading-none"
            style={{ color: stroke }}
          >
            {fmtRatio(headlineValue)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          {view === "trade" ? "Tradewise" : "Daywise"} · expanding window (all history to each point)
        </p>
      </div>

      {chartData.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-center py-12 px-4">
          <p className="text-[11px] font-medium text-muted-foreground/45 leading-relaxed max-w-[220px]">
            Need at least 5 closed trades for ratio history
          </p>
        </div>
      ) : (
        <div className="h-[260px] sm:h-[280px] flex-1 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
              <defs>
                <linearGradient id={`ratioFill-${ratioKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickFormatter={(v) => (view === "trade" ? `#${v}` : String(v))}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickFormatter={(v: number) => v.toFixed(1)}
                width={36}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(v) =>
                  view === "trade" ? `After trade #${v}` : String(v)
                }
                formatter={(value: number, _: string, props: { payload?: { tooltip?: string } }) => [
                  fmtRatio(value),
                  props.payload?.tooltip ?? RATIO_LABELS[ratioKey],
                ]}
              />
              {(ratioKey === "sharpe" || ratioKey === "sortino") && (
                <ReferenceLine
                  y={1}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 4"
                  label={{
                    value: "1.0",
                    position: "right",
                    fontSize: 9,
                    fill: "rgba(255,255,255,0.35)",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#ratioFill-${ratioKey})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: stroke,
                  stroke: "#0f0f11",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
