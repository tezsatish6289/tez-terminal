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
  /** @deprecated — all charts use compact terminal styling */
  theme?: "terminal" | "performance";
}

function statusAtValue(ratioKey: RatioKey, v: number): MetricStatus {
  return statusForRatio(ratioKey, v);
}

export function RatioDrilldownChart({
  ratioKey,
  series,
  view,
  headlineValue,
}: RatioDrilldownChartProps) {
  const insight = insightForRatio(ratioKey);
  const tiers = ratioChartTiers(ratioKey);

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

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#1a1a1d",
      border: "1px solid rgba(255,255,255,0.07)",
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
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55 block">
            {insight.title}
          </span>
          <p className="text-[10px] text-muted-foreground/45 mt-0.5 leading-snug line-clamp-2">
            {insight.shortInterpretation}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-xl font-mono font-bold tabular-nums leading-none"
            style={{ color: stroke }}
          >
            {headlineValue != null ? formatRatioValue(headlineValue) : "—"}
          </span>
          <span
            className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: pillSolidBg(status), color: "#fff" }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground/40">
        {view === "trade" ? "Tradewise" : "Daywise"} · expanding window
      </p>

      {chartData.length < 2 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-center">
          <p className="text-[10px] text-muted-foreground/45">
            Need at least 5 closed trades for ratio history
          </p>
        </div>
      ) : (
        <>
          <div className="h-[200px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 24, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id={`ratioFill-${ratioKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stroke} stopOpacity={0.35} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickFormatter={(v) => (view === "trade" ? `#${v}` : String(v))}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  width={28}
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
                  fill={`url(#ratioFill-${ratioKey})`}
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: stroke,
                    stroke: "#0f0f11",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9px] text-muted-foreground/40">
            <span className="font-medium text-muted-foreground/35">Chart bands:</span>
            {tiers
              .filter((t) => t.y2 <= yMax && t.y1 >= yMin - 1)
              .map((tier) => (
                <span key={tier.chartLabel} className="inline-flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-sm shrink-0 opacity-80"
                    style={{ backgroundColor: tierFillColor(tier.status) }}
                    aria-hidden
                  />
                  <span style={{ color: tierFillColor(tier.status) }}>{tier.chartLabel}</span>
                </span>
              ))}
          </p>
        </>
      )}
    </div>
  );
}
