"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { SimTrade } from "@/lib/simulator";
import {
  buildRatioSeries,
  calcPerformanceMetrics,
} from "@/lib/performance-metrics";
import { RatioDrilldownChart } from "./RatioDrilldownChart";

interface RiskRatioDrilldownsProps {
  trades: SimTrade[];
  startingCapital: number;
  assetType: string;
  theme?: "terminal" | "performance";
}

export function RiskRatioDrilldowns({
  trades,
  startingCapital,
  assetType,
  theme = "terminal",
}: RiskRatioDrilldownsProps) {
  const [view, setView] = useState<"trade" | "day">("trade");
  const riskFree = assetType === "INDIAN_STOCKS" ? 0.065 : 0;

  const headline = useMemo(
    () => calcPerformanceMetrics(trades, startingCapital, riskFree),
    [trades, startingCapital, riskFree],
  );

  const series = useMemo(
    () => buildRatioSeries(trades, startingCapital, riskFree, view),
    [trades, startingCapital, riskFree, view],
  );

  if (!headline) return null;

  const isPerf = theme === "performance";
  const borderCol = isPerf ? "rgba(90,140,220,0.12)" : "rgba(255,255,255,0.06)";

  return (
    <section
      className={isPerf ? "mt-8 pt-8 space-y-6" : "mt-10 pt-10 border-t border-white/[0.06] space-y-6"}
      style={isPerf ? { borderTop: `1px solid ${borderCol}` } : undefined}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2
          className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            !isPerf && "text-muted-foreground/75",
          )}
          style={isPerf ? { color: "#64748b" } : undefined}
        >
          Ratio history
        </h2>
        <div
          className="flex items-center gap-1 rounded-lg p-1"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border: `1px solid ${borderCol}`,
          }}
        >
          {(
            [
              { key: "trade" as const, label: "Tradewise" },
              { key: "day" as const, label: "Daywise" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                view === v.key
                  ? isPerf
                    ? "bg-[rgba(96,165,250,0.2)] text-[#60a5fa]"
                    : "bg-accent/20 text-accent"
                  : isPerf
                    ? "text-[#475569] hover:text-[#64748b]"
                    : "text-muted-foreground/50 hover:text-muted-foreground/75",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <RatioDrilldownChart
          ratioKey="sharpe"
          series={series}
          view={view}
          headlineValue={headline.sharpeRatio}
          theme={theme}
        />
        <RatioDrilldownChart
          ratioKey="sortino"
          series={series}
          view={view}
          headlineValue={headline.sortinoRatio}
          theme={theme}
        />
        <RatioDrilldownChart
          ratioKey="calmar"
          series={series}
          view={view}
          headlineValue={headline.calmarRatio}
          theme={theme}
        />
      </div>
    </section>
  );
}
