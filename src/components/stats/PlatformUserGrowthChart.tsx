"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/firebase";
import { BRAND_CURVE_STROKE } from "@/lib/chart-brand-colors";
import { botSourceLabel, type BotSourceFilter } from "@/lib/bot-source-filter";
import type { PlatformUserGrowthSeries } from "@/lib/freedombot/platform-user-growth";
import { useChartMotion } from "@/hooks/use-chart-motion";

interface PlatformUserGrowthChartProps {
  botSourceFilter: BotSourceFilter;
  className?: string;
}

function GrowthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { day: number; users: number; date: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  let dateLabel = row.date;
  try {
    dateLabel = format(parseISO(`${row.date}T12:00:00.000Z`), "MMM d, yyyy");
  } catch {
    /* keep raw */
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0a1628] px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white mb-1">
        Day {row.day}
        {row.day === 0 ? " · launch" : ""}
      </p>
      <p className="text-muted-foreground/70 mb-1.5">{dateLabel}</p>
      <p className="font-semibold tabular-nums text-blue-400">
        {row.users.toLocaleString()} user{row.users === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function PlatformUserGrowthChart({
  botSourceFilter,
  className,
}: PlatformUserGrowthChartProps) {
  const { user } = useUser();
  const motion = useChartMotion();
  const [series, setSeries] = useState<PlatformUserGrowthSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const token = await user.getIdToken();
        const q = encodeURIComponent(botSourceFilter);
        const res = await fetch(`/api/freedombot/platform-user-growth?botSource=${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load user growth");
        if (!cancelled) setSeries(data.series ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          setSeries(null);
          setError(e instanceof Error ? e.message : "Unexpected error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, botSourceFilter]);

  const chartData = useMemo(() => series?.points ?? [], [series]);
  const totalUsers = series?.totalUsers ?? 0;
  const filterLabel = botSourceLabel(botSourceFilter);

  const day0Label = useMemo(() => {
    if (!series?.day0) return null;
    try {
      return format(parseISO(series.day0), "MMM d, yyyy");
    } catch {
      return null;
    }
  }, [series?.day0]);

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
            Platform users
          </h2>
          <p className="text-[11px] text-muted-foreground/45 max-w-xl">
            Cumulative FreedomBot deployers since Day 0
            {day0Label ? ` (${day0Label})` : ""}
            {botSourceFilter !== "ALL" ? ` · ${filterLabel}` : ""}.
          </p>
        </div>
        {!loading && !error && totalUsers > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <Users className="h-3.5 w-3.5 text-blue-400/70" />
            <span className="text-lg font-black tabular-nums text-blue-400 leading-none">
              {totalUsers.toLocaleString()}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              total
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <Loader2 className="h-6 w-6 animate-spin text-accent/50" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
          <p className="text-sm text-rose-400/90">{error}</p>
        </div>
      ) : chartData.length < 2 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
          <Users className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-bold text-muted-foreground/55">No deploy history yet</p>
          <p className="text-[11px] text-muted-foreground/45 max-w-sm">
            User growth appears after the first FreedomBot deployment
            {botSourceFilter !== "ALL" ? ` for ${filterLabel}` : ""}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickFormatter={(d) => (d === 0 ? "0" : String(d))}
                label={{
                  value: "Days since first deploy",
                  position: "insideBottom",
                  offset: -2,
                  fill: "rgba(148,163,184,0.45)",
                  fontSize: 10,
                }}
              />
              <YAxis
                dataKey="users"
                allowDecimals={false}
                width={36}
                tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: "Users",
                  angle: -90,
                  position: "insideLeft",
                  fill: "rgba(148,163,184,0.45)",
                  fontSize: 10,
                }}
              />
              <Tooltip content={<GrowthTooltip />} />
              <Line
                type="monotone"
                dataKey="users"
                stroke={BRAND_CURVE_STROKE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: BRAND_CURVE_STROKE }}
                isAnimationActive={motion}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
