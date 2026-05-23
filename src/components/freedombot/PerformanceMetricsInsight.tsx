"use client";

import { Activity, LineChart, Mountain, Shield, TrendingDown } from "lucide-react";
import type { PerformanceMetrics } from "@/lib/performance-metrics";
import {
  CALMAR_INSIGHT,
  DRAWDOWN_INSIGHT,
  METRIC_COMPARISON_STRIP,
  SHARPE_INSIGHT,
  SORTINO_INSIGHT,
  drawdownStatus,
  formatDrawdownValue,
  formatRatioValue,
  ratioStatusCalmar,
  ratioStatusSharpeSortino,
} from "@/lib/metric-insight-config";
import { MetricInsightCard } from "./MetricInsightCard";

interface PerformanceMetricsInsightProps {
  metrics: PerformanceMetrics | null;
  className?: string;
}

export function PerformanceMetricsInsight({
  metrics,
  className,
}: PerformanceMetricsInsightProps) {
  if (!metrics) {
    return (
      <div
        className="rounded-xl p-6 text-center text-sm"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(90,140,220,0.08)",
          color: "#475569",
        }}
      >
        Need at least 5 closed trades for risk metrics.
      </div>
    );
  }

  return (
    <section
      className={className}
      aria-labelledby="performance-metrics-heading"
    >
      <div
        className="rounded-xl p-4 sm:p-5 flex flex-col gap-5 h-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,22,40,0.95) 0%, rgba(8,15,30,0.98) 100%)",
          border: "1px solid rgba(90,140,220,0.12)",
        }}
      >
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2
              id="performance-metrics-heading"
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "#94a3b8" }}
            >
              Performance metrics
            </h2>
            <p className="text-[10px] mt-1" style={{ color: "#334155" }}>
              {metrics.tradingDays} active trading days · annualised
            </p>
          </div>
          <Activity className="w-4 h-4 shrink-0" style={{ color: "#60a5fa" }} />
        </header>

        {/* Compact comparison strip */}
        <div
          className="rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(90,140,220,0.08)",
          }}
        >
          {METRIC_COMPARISON_STRIP.map((row) => (
            <div
              key={row.metric}
              className="flex items-baseline justify-between gap-2 text-[11px] sm:block"
            >
              <span className="font-bold" style={{ color: "#60a5fa" }}>
                {row.metric}
              </span>
              <span className="sm:mt-0.5 block" style={{ color: "#475569" }}>
                → {row.measures}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 flex-1">
          <MetricInsightCard
            className="h-full"
            definition={SHARPE_INSIGHT}
            value={formatRatioValue(metrics.sharpeRatio)}
            status={ratioStatusSharpeSortino(metrics.sharpeRatio)}
            icon={<LineChart className="h-4 w-4" />}
          />
          <MetricInsightCard
            className="h-full"
            definition={SORTINO_INSIGHT}
            value={formatRatioValue(metrics.sortinoRatio)}
            status={ratioStatusSharpeSortino(metrics.sortinoRatio)}
            icon={<Shield className="h-4 w-4" />}
          />
          <MetricInsightCard
            className="h-full"
            definition={CALMAR_INSIGHT}
            value={formatRatioValue(metrics.calmarRatio)}
            status={ratioStatusCalmar(metrics.calmarRatio)}
            icon={<Mountain className="h-4 w-4" />}
          />
          <MetricInsightCard
            className="h-full"
            definition={DRAWDOWN_INSIGHT}
            value={formatDrawdownValue(metrics.maxDrawdownPct)}
            status={drawdownStatus(metrics.maxDrawdownPct)}
            icon={<TrendingDown className="h-4 w-4" />}
          />
        </div>

        <p
          className="text-[11px] sm:text-xs leading-relaxed text-center px-1"
          style={{ color: "#64748b" }}
        >
          These metrics help evaluate not just profitability, but the quality and
          stability of returns.
        </p>

        <p
          className="text-[10px] leading-relaxed text-center"
          style={{ color: "#334155" }}
        >
          Based on{" "}
          <span style={{ color: "#475569", fontWeight: 600 }}>closed trades only</span>.
          Ratios are annualised. Risk-free: 0% (crypto).
        </p>
      </div>
    </section>
  );
}
