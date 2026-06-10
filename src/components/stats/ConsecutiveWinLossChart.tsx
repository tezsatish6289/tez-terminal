"use client";

import { useId, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BRAND_CURVE_FILL_OPACITY,
  BRAND_CURVE_STROKE,
} from "@/lib/chart-brand-colors";
import { botSourceLabel, type BotSourceFilter } from "@/lib/bot-source-filter";
import type { SimTrade } from "@/lib/simulator";
import { buildConsecutiveWinLossSeries } from "@/lib/freedombot/consecutive-win-loss-series";
import { useChartMotion } from "@/hooks/use-chart-motion";

const WIN_BAR = "#22c55e";
const LOSS_BAR = "#ef4444";

interface ConsecutiveWinLossChartProps {
  trades: SimTrade[];
  day0Ms: number | null;
  botSourceFilter: BotSourceFilter;
  className?: string;
}

function NetEndLabel({
  x,
  y,
  value,
  index,
  lastIndex,
}: {
  x?: number;
  y?: number;
  value?: number | string;
  index?: number;
  lastIndex: number;
}) {
  if (index !== lastIndex || x == null || y == null || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const text = n > 0 ? `+${n}` : String(n);
  return (
    <text
      x={x + 8}
      y={y}
      fill="#f8fafc"
      fontSize={12}
      fontWeight={800}
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { day: number; date: string; wins: number; losses: number; cumulativeNet: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  let dateLabel = row.date;
  try {
    dateLabel = format(parseISO(`${row.date}T12:00:00.000Z`), "MMM d, yyyy");
  } catch {
    /* keep raw */
  }

  const net = row.cumulativeNet;
  const hasActivity = row.wins > 0 || row.losses > 0;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0a1628] px-3 py-2 text-xs shadow-xl space-y-1.5">
      <p className="font-bold text-white">
        Day {row.day}
        {row.day === 0 ? " · launch" : ""}
      </p>
      <p className="text-muted-foreground/70">{dateLabel}</p>
      {hasActivity && (
        <div className="space-y-0.5 text-muted-foreground/80">
          {row.wins > 0 && (
            <p>
              <span className="text-emerald-400 font-semibold">{row.wins}</span> win
              {row.wins === 1 ? "" : "s"} today
            </p>
          )}
          {row.losses > 0 && (
            <p>
              <span className="text-rose-400 font-semibold">{row.losses}</span> loss
              {row.losses === 1 ? "" : "es"} today
            </p>
          )}
        </div>
      )}
      <p
        className={cn(
          "font-semibold tabular-nums pt-0.5 border-t border-white/[0.06]",
          net > 0 && "text-blue-400",
          net < 0 && "text-rose-400",
          net === 0 && "text-muted-foreground/70",
        )}
      >
        Cumulative net: {net > 0 ? `+${net}` : net}
      </p>
    </div>
  );
}

export function ConsecutiveWinLossChart({
  trades,
  day0Ms,
  botSourceFilter,
  className,
}: ConsecutiveWinLossChartProps) {
  const motion = useChartMotion();
  const gradientId = useId().replace(/:/g, "");
  const filterLabel = botSourceLabel(botSourceFilter);

  const series = useMemo(() => {
    if (day0Ms == null) return null;
    return buildConsecutiveWinLossSeries(trades, day0Ms);
  }, [trades, day0Ms]);

  const chartData = series?.points ?? [];
  const closedCount = trades.filter((t) => t.status === "CLOSED").length;
  const lastIndex = Math.max(0, chartData.length - 1);

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-3, 3] as [number, number];
    let min = 0;
    let max = 0;
    for (const p of chartData) {
      min = Math.min(min, p.lossBar, p.cumulativeNet);
      max = Math.max(max, p.wins, p.cumulativeNet);
    }
    const pad = Math.max(2, Math.ceil(Math.max(Math.abs(min), Math.abs(max)) * 0.15));
    return [min - pad, max + pad] as [number, number];
  }, [chartData]);

  const day0Label = useMemo(() => {
    if (!series?.day0) return null;
    try {
      return format(parseISO(series.day0), "MMM d, yyyy");
    } catch {
      return null;
    }
  }, [series?.day0]);

  const cumulativeNet = series?.cumulativeNet ?? 0;

  return (
    <section
      className={cn(
        "space-y-4 border-t border-white/[0.06] pt-10 sm:pt-12",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
            Consecutive wins / losses
          </h2>
          <p className="text-[11px] text-muted-foreground/45 max-w-xl">
            Blue line = cumulative net (wins − losses). Green / red bars = wins
            and losses closed that day
            {day0Label ? ` (${day0Label})` : ""}
            {botSourceFilter !== "ALL" ? ` · ${filterLabel}` : ""}.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/45">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#60a5fa]" aria-hidden />
              Cumulative net
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden />
              Wins
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden />
              Losses
            </span>
          </div>
        </div>
        {series && closedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            {cumulativeNet > 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-blue-400/70" />
            ) : cumulativeNet < 0 ? (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400/70" />
            ) : null}
            <span
              className={cn(
                "text-lg font-black tabular-nums leading-none",
                cumulativeNet > 0 && "text-blue-400",
                cumulativeNet < 0 && "text-rose-400",
                cumulativeNet === 0 && "text-muted-foreground/55",
              )}
            >
              {cumulativeNet > 0
                ? `+${cumulativeNet}`
                : cumulativeNet < 0
                  ? String(cumulativeNet)
                  : "0"}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              net
            </span>
          </div>
        )}
      </div>

      {day0Ms == null ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground/55">No launch date yet</p>
          <p className="text-[11px] text-muted-foreground/45 max-w-sm">
            Win/loss history appears once the simulator has a track record
            {botSourceFilter !== "ALL" ? ` for ${filterLabel}` : ""}.
          </p>
        </div>
      ) : closedCount === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground/55">No closed trades yet</p>
          <p className="text-[11px] text-muted-foreground/45 max-w-sm">
            Chart populates after the first position fully closes
            {botSourceFilter !== "ALL" ? ` for ${filterLabel}` : ""}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 44, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={BRAND_CURVE_STROKE}
                    stopOpacity={BRAND_CURVE_FILL_OPACITY.top}
                  />
                  <stop
                    offset="100%"
                    stopColor={BRAND_CURVE_STROKE}
                    stopOpacity={BRAND_CURVE_FILL_OPACITY.bottom}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
              <XAxis
                dataKey="day"
                type="number"
                domain={[0, series?.maxDay ?? "dataMax"]}
                allowDecimals={false}
                tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickFormatter={(d) => (d === 0 ? "0" : String(d))}
                label={{
                  value: "Days since launch",
                  position: "insideBottom",
                  offset: -2,
                  fill: "rgba(148,163,184,0.45)",
                  fontSize: 10,
                }}
              />
              <YAxis
                allowDecimals={false}
                domain={yDomain}
                width={36}
                tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="wins"
                fill={WIN_BAR}
                radius={[2, 2, 0, 0]}
                maxBarSize={14}
                isAnimationActive={motion}
              />
              <Bar
                dataKey="lossBar"
                fill={LOSS_BAR}
                radius={[0, 0, 2, 2]}
                maxBarSize={14}
                isAnimationActive={motion}
              />
              <Area
                type="monotone"
                dataKey="cumulativeNet"
                stroke={BRAND_CURVE_STROKE}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: BRAND_CURVE_STROKE, strokeWidth: 0 }}
                isAnimationActive={motion}
              >
                <LabelList
                  dataKey="cumulativeNet"
                  content={(props) => (
                    <NetEndLabel {...props} lastIndex={lastIndex} />
                  )}
                />
              </Area>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
