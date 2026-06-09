"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_CURVE_STROKE } from "@/lib/chart-brand-colors";
import { botSourceLabel, type BotSourceFilter } from "@/lib/bot-source-filter";
import type { SimTrade } from "@/lib/simulator";
import { buildConsecutiveWinLossSeries } from "@/lib/freedombot/consecutive-win-loss-series";
import { useChartMotion } from "@/hooks/use-chart-motion";

interface ConsecutiveWinLossChartProps {
  trades: SimTrade[];
  day0Ms: number | null;
  botSourceFilter: BotSourceFilter;
  className?: string;
}

function streakLabel(value: number): string {
  if (value > 0) {
    return `${value} consecutive win${value === 1 ? "" : "s"}`;
  }
  if (value < 0) {
    const n = Math.abs(value);
    return `${n} consecutive loss${n === 1 ? "" : "es"}`;
  }
  return "Launch · no streak yet";
}

function StreakTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: {
    payload: {
      day: number;
      streak: number;
      date: string;
    };
  }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  let dateLabel = row.date;
  try {
    dateLabel = format(parseISO(`${row.date}T12:00:00.000Z`), "MMM d, yyyy");
  } catch {
    /* keep raw */
  }

  const positive = row.streak > 0;
  const negative = row.streak < 0;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0a1628] px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white mb-1">
        Day {row.day}
        {row.day === 0 ? " · launch" : ""}
      </p>
      <p className="text-muted-foreground/70 mb-1.5">{dateLabel}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          positive && "text-blue-400",
          negative && "text-rose-400",
          !positive && !negative && "text-muted-foreground/70",
        )}
      >
        {streakLabel(row.streak)}
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
  const filterLabel = botSourceLabel(botSourceFilter);

  const series = useMemo(() => {
    if (day0Ms == null) return null;
    return buildConsecutiveWinLossSeries(trades, day0Ms);
  }, [trades, day0Ms]);

  const chartData = series?.points ?? [];
  const closedCount = trades.filter((t) => t.status === "CLOSED").length;

  const day0Label = useMemo(() => {
    if (!series?.day0) return null;
    try {
      return format(parseISO(series.day0), "MMM d, yyyy");
    } catch {
      return null;
    }
  }, [series?.day0]);

  const currentStreak = series?.currentStreak ?? 0;

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
            One point per streak episode — lines climb on win runs and dip on loss
            runs, flipping when direction changes (same-day flips supported)
            {day0Label ? ` (${day0Label})` : ""}
            {botSourceFilter !== "ALL" ? ` · ${filterLabel}` : ""}.
          </p>
        </div>
        {series && closedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            {currentStreak > 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-blue-400/70" />
            ) : currentStreak < 0 ? (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400/70" />
            ) : null}
            <span
              className={cn(
                "text-lg font-black tabular-nums leading-none",
                currentStreak > 0 && "text-blue-400",
                currentStreak < 0 && "text-rose-400",
                currentStreak === 0 && "text-muted-foreground/55",
              )}
            >
              {currentStreak > 0
                ? `+${currentStreak}`
                : currentStreak < 0
                  ? String(currentStreak)
                  : "0"}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              current
            </span>
          </div>
        )}
      </div>

      {day0Ms == null ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground/55">No launch date yet</p>
          <p className="text-[11px] text-muted-foreground/45 max-w-sm">
            Streak history appears once the simulator has a track record
            {botSourceFilter !== "ALL" ? ` for ${filterLabel}` : ""}.
          </p>
        </div>
      ) : closedCount === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground/55">No closed trades yet</p>
          <p className="text-[11px] text-muted-foreground/45 max-w-sm">
            Streak chart populates after the first position fully closes
            {botSourceFilter !== "ALL" ? ` for ${filterLabel}` : ""}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <ReferenceLine
                y={0}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="4 4"
                label={{
                  value: "Zero line",
                  position: "insideTopLeft",
                  fill: "rgba(148,163,184,0.4)",
                  fontSize: 9,
                }}
              />
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
                dataKey="streak"
                allowDecimals={false}
                width={36}
                tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: "Streak",
                  angle: -90,
                  position: "insideLeft",
                  fill: "rgba(148,163,184,0.45)",
                  fontSize: 10,
                }}
              />
              <Tooltip content={<StreakTooltip />} />
              <Line
                type="linear"
                dataKey="streak"
                stroke={BRAND_CURVE_STROKE}
                strokeWidth={2}
                dot={{ r: 3, fill: BRAND_CURVE_STROKE, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: BRAND_CURVE_STROKE }}
                isAnimationActive={motion}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
