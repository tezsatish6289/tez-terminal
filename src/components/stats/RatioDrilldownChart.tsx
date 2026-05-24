"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart } from "lucide-react";
import type { RatioSeriesPoint } from "@/lib/performance-metrics";
import {
  formatRatioValue,
  insightForRatio,
  pillSolidBg,
  ratioChartTiers,
  statusForRatio,
  tierFillColor,
  STATUS_META,
  type MetricStatus,
} from "@/lib/metric-insight-config";

export type RatioKey = "sharpe" | "sortino" | "calmar";

interface RatioDrilldownChartProps {
  ratioKey: RatioKey;
  series: RatioSeriesPoint[];
  view: "trade" | "day";
  headlineValue: number | null;
  theme?: "terminal" | "performance";
}

function statusAtValue(ratioKey: RatioKey, v: number): MetricStatus {
  return statusForRatio(ratioKey, v);
}

function valueTextShadow(color: string): string {
  return `0 0 20px ${color}44`;
}

export function RatioDrilldownChart({
  ratioKey,
  series,
  view,
  headlineValue,
  theme = "terminal",
}: RatioDrilldownChartProps) {
  const insight = insightForRatio(ratioKey);
  const tiers = ratioChartTiers(ratioKey);
  const isPerf = theme === "performance";

  const status =
    headlineValue != null && Number.isFinite(headlineValue)
      ? statusForRatio(ratioKey, headlineValue)
      : "weak";
  const meta = STATUS_META[status];
  const stroke = meta.valueColor;

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
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 3;
  const tierCeil = ratioKey === "calmar" ? Math.max(6, dataMax) : Math.max(4, dataMax);
  const yMin = Math.floor(Math.min(dataMin, 0) * 10) / 10 - 0.2;
  const yMax = Math.ceil(Math.max(dataMax, tierCeil) * 10) / 10 + 0.3;

  const borderCol = isPerf ? "rgba(90,140,220,0.12)" : "rgba(255,255,255,0.07)";
  const bgCard = isPerf ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.02)";
  const gridCol = isPerf ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.06)";
  const axisCol = isPerf ? "rgba(90,140,220,0.45)" : "rgba(255,255,255,0.45)";
  const mutedCol = isPerf ? "#475569" : undefined;

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: isPerf ? "#0a1628" : "#1a1a1d",
      border: `1px solid ${borderCol}`,
      borderRadius: "8px",
      fontSize: "11px",
      color: "#e2e8f0",
    },
    labelStyle: { color: "#94a3b8", marginBottom: "4px" },
    itemStyle: { color: "#e2e8f0" },
  };

  const refLines =
    ratioKey === "calmar"
      ? [
          { y: 1, label: "1" },
          { y: 2, label: "2" },
          { y: 5, label: "5" },
        ]
      : [
          { y: 1, label: "1" },
          { y: 2, label: "2" },
          { y: 3, label: "3" },
        ];

  return (
    <div
      className="rounded-xl border px-5 py-5 sm:px-6 sm:py-6 flex flex-col gap-4 h-full"
      style={{
        backgroundColor: bgCard,
        borderColor: borderCol,
        boxShadow: status === "exceptional" ? meta.glow : undefined,
      }}
    >
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <LineChart className="w-4 h-4 shrink-0" style={{ color: "#60a5fa" }} />
            <div>
              <span
                className="text-xs font-bold uppercase tracking-wider block"
                style={{ color: isPerf ? "#94a3b8" : undefined }}
              >
                {insight.title}
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: mutedCol ?? "rgba(255,255,255,0.35)" }}
              >
                {insight.helperLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-2xl font-mono font-black tabular-nums leading-none"
              style={{ color: stroke, textShadow: valueTextShadow(stroke) }}
            >
              {headlineValue != null ? formatRatioValue(headlineValue) : "—"}
            </span>
            <span
              className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md"
              style={{ backgroundColor: pillSolidBg(status), color: "#fff" }}
            >
              {meta.label}
            </span>
          </div>
        </div>
        <p
          className="text-[11px] leading-relaxed"
          style={{ color: mutedCol ?? "rgba(255,255,255,0.5)" }}
        >
          {insight.shortInterpretation}
        </p>
        <p className="text-[10px]" style={{ color: mutedCol ?? "rgba(255,255,255,0.35)" }}>
          {view === "trade" ? "Tradewise" : "Daywise"} · expanding window
        </p>
      </header>

      {chartData.length < 2 ? (
        <div className="flex-1 flex items-center justify-center py-12 text-center">
          <p className="text-[11px]" style={{ color: mutedCol ?? "rgba(255,255,255,0.4)" }}>
            Need at least 5 closed trades for ratio history
          </p>
        </div>
      ) : (
        <>
          <div className="h-[240px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 28, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id={`ratioFill-${ratioKey}-${theme}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stroke} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {tiers.map((tier) => {
                  const y1 = Math.max(yMin, tier.y1);
                  const y2 = Math.min(yMax, tier.y2);
                  if (y2 <= y1) return null;
                  return (
                    <ReferenceArea
                      key={`${tier.chartLabel}-${tier.y1}`}
                      y1={y1}
                      y2={y2}
                      fill={tierFillColor(tier.status)}
                      fillOpacity={0.07}
                      strokeOpacity={0}
                    />
                  );
                })}
                <CartesianGrid strokeDasharray="3 3" stroke={gridCol} />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 9, fill: axisCol }}
                  tickLine={false}
                  axisLine={{ stroke: gridCol }}
                  tickFormatter={(v) => (view === "trade" ? `#${v}` : String(v))}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 9, fill: axisCol }}
                  tickLine={false}
                  axisLine={{ stroke: gridCol }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  width={32}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) =>
                    view === "trade" ? `After trade #${v}` : String(v)
                  }
                  formatter={(value: number) => {
                    const tier = statusAtValue(ratioKey, value);
                    return [
                      `${formatRatioValue(value)} · ${STATUS_META[tier].label}`,
                      insight.helperLabel,
                    ];
                  }}
                />
                {refLines.map((rl) => (
                  <ReferenceLine
                    key={rl.y}
                    y={rl.y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="3 3"
                    label={{
                      value: rl.label,
                      position: "right",
                      fontSize: 8,
                      fill: "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  strokeWidth={2}
                  fill={`url(#ratioFill-${ratioKey}-${theme})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: stroke,
                    stroke: isPerf ? "#080f1e" : "#0f0f11",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Integrated scale legend */}
          <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
            {tiers
              .filter((t) => t.y2 <= yMax && t.y1 >= yMin - 1)
              .map((tier) => (
                <span
                  key={tier.chartLabel}
                  className="inline-flex items-center gap-1.5 text-[9px] font-semibold px-2 py-1 rounded-md"
                  style={{
                    backgroundColor: `${tierFillColor(tier.status)}14`,
                    color: tierFillColor(tier.status),
                    border: `1px solid ${tierFillColor(tier.status)}33`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: tierFillColor(tier.status) }}
                  />
                  {tier.chartLabel}
                </span>
              ))}
          </div>
          <p
            className="text-[10px] italic text-center sm:text-left"
            style={{ color: mutedCol ?? "rgba(255,255,255,0.35)" }}
          >
            Think of it as: &ldquo;{insight.thinkOfIt}&rdquo;
          </p>
        </>
      )}
    </div>
  );
}
