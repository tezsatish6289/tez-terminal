"use client";

import { Shield } from "lucide-react";
import type { PerformanceMetrics } from "@/lib/performance-metrics";
import {
  CALMAR_INSIGHT,
  DRAWDOWN_INSIGHT,
  SHARPE_INSIGHT,
  SORTINO_INSIGHT,
  drawdownStatus,
  formatDrawdownValue,
  formatRatioValue,
  ratioStatusCalmar,
  ratioStatusSharpeSortino,
} from "@/lib/metric-insight-config";
import { MetricInsightCard } from "./MetricInsightCard";
import { cn } from "@/lib/utils";

interface PerformanceMetricsInsightProps {
  metrics: PerformanceMetrics | null;
  className?: string;
  /** Vertical stack beside fund chart (original layout) */
  variant?: "sidebar" | "grid";
}

export function PerformanceMetricsInsight({
  metrics,
  className,
  variant = "sidebar",
}: PerformanceMetricsInsightProps) {
  if (!metrics) {
    return (
      <div
        className={cn("rounded-lg p-4 text-center text-[10px] h-full flex items-center justify-center", className)}
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(90,140,220,0.08)",
          color: "#334155",
        }}
      >
        Need at least 5 closed trades for risk metrics.
      </div>
    );
  }

  const cards = (
    <>
      <MetricInsightCard
        compact={variant === "sidebar"}
        definition={SHARPE_INSIGHT}
        value={formatRatioValue(metrics.sharpeRatio)}
        status={ratioStatusSharpeSortino(metrics.sharpeRatio)}
      />
      <MetricInsightCard
        compact={variant === "sidebar"}
        definition={SORTINO_INSIGHT}
        value={formatRatioValue(metrics.sortinoRatio)}
        status={ratioStatusSharpeSortino(metrics.sortinoRatio)}
      />
      <MetricInsightCard
        compact={variant === "sidebar"}
        definition={CALMAR_INSIGHT}
        value={formatRatioValue(metrics.calmarRatio)}
        status={ratioStatusCalmar(metrics.calmarRatio)}
      />
      <MetricInsightCard
        compact={variant === "sidebar"}
        definition={DRAWDOWN_INSIGHT}
        value={formatDrawdownValue(metrics.maxDrawdownPct)}
        status={drawdownStatus(metrics.maxDrawdownPct)}
      />
    </>
  );

  if (variant === "sidebar") {
    return (
      <section
        className={cn("h-full flex flex-col", className)}
        aria-labelledby="performance-metrics-heading"
      >
        <div
          className="rounded-lg p-3 flex flex-col gap-2 h-full min-h-0"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(90,140,220,0.08)",
          }}
        >
          <header className="flex items-center justify-between gap-2 shrink-0 pb-0.5">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" style={{ color: "#60a5fa" }} />
              <span
                id="performance-metrics-heading"
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "#475569" }}
              >
                Performance
              </span>
            </div>
            <span className="text-[9px]" style={{ color: "#334155" }}>
              {metrics.tradingDays}d · annualised
            </span>
          </header>

          <div className="flex flex-col gap-1.5 flex-1 min-h-0 justify-between">{cards}</div>

          <p className="text-[9px] leading-snug shrink-0 pt-0.5" style={{ color: "#1e3a5f" }}>
            Based on{" "}
            <span style={{ color: "#334155", fontWeight: 600 }}>closed trades only</span>.
            Ratios are annualised. Risk-free: 0% (crypto).
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={className} aria-labelledby="performance-metrics-heading">
      <div
        className="rounded-xl p-4 sm:p-5 flex flex-col gap-4"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(90,140,220,0.12)",
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{cards}</div>
        <p className="text-[10px] text-center" style={{ color: "#334155" }}>
          Based on closed trades only. Ratios are annualised. Risk-free: 0% (crypto).
        </p>
      </div>
    </section>
  );
}
