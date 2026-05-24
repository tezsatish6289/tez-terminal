"use client";

import { useMemo } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimTrade } from "@/lib/simulator";
import { calcPerformanceMetrics } from "@/lib/performance-metrics";
import { formatDrawdownValue } from "@/lib/metric-insight-config";

function MetricTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">
        {label}
      </span>
      <span className={cn("text-xl font-mono font-bold tabular-nums", color)}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground/50">{sub}</span>}
    </div>
  );
}

export function PerformanceMetricsPanel({
  trades,
  startingCapital,
  assetType,
  className,
}: {
  trades: SimTrade[];
  startingCapital: number;
  assetType: string;
  className?: string;
}) {
  const metrics = useMemo(
    () =>
      calcPerformanceMetrics(
        trades,
        startingCapital,
        assetType === "INDIAN_STOCKS" ? 0.065 : 0,
      ),
    [trades, startingCapital, assetType],
  );

  if (!metrics) return null;

  const fmt = (n: number, dp = 2) => {
    if (!isFinite(n)) return "∞";
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(dp)}`;
  };

  const ratioColor = (n: number) =>
    !isFinite(n) || n >= 1.5
      ? "text-emerald-400"
      : n >= 0.5
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <div
      className={cn(
        "rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3 h-full",
        className,
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
            Performance
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground/50">
          {metrics.tradingDays}d · annualised
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <MetricTile
          label="Sharpe Ratio"
          value={fmt(metrics.sharpeRatio)}
          sub="Higher › 1 is good"
          color={ratioColor(metrics.sharpeRatio)}
        />
        <MetricTile
          label="Sortino Ratio"
          value={fmt(metrics.sortinoRatio)}
          sub="Downside-adjusted"
          color={ratioColor(metrics.sortinoRatio)}
        />
        <MetricTile
          label="Calmar Ratio"
          value={fmt(metrics.calmarRatio)}
          sub="Return / Max DD"
          color={ratioColor(metrics.calmarRatio)}
        />
        <MetricTile
          label="Max Drawdown"
          value={formatDrawdownValue(metrics.maxDrawdownPct)}
          sub="Peak-to-trough (closed)"
          color={
            metrics.maxDrawdownPct < 15
              ? "text-emerald-400"
              : metrics.maxDrawdownPct < 30
                ? "text-amber-400"
                : "text-rose-400"
          }
        />
      </div>

      <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
        Based on{" "}
        <span className="text-muted-foreground/65 font-semibold">closed trades only</span>.
        Ratios are annualised. Risk-free: 0% (crypto).
      </p>
    </div>
  );
}
