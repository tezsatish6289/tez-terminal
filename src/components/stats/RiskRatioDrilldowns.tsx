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
  className?: string;
  /** @deprecated — styling is unified with /stats */
  theme?: "terminal" | "performance";
}

export function RiskRatioDrilldowns({
  trades,
  startingCapital,
  assetType,
  className,
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

  return (
    <section
      className={cn(
        "space-y-5 border-t border-white/[0.06] pt-10 sm:pt-12",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
          Ratio history
        </h2>
        <div className="flex items-center gap-1 rounded-lg p-1 bg-white/[0.03] border border-white/[0.06]">
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
                  ? "bg-accent/20 text-accent"
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
        />
        <RatioDrilldownChart
          ratioKey="sortino"
          series={series}
          view={view}
          headlineValue={headline.sortinoRatio}
        />
        <RatioDrilldownChart
          ratioKey="calmar"
          series={series}
          view={view}
          headlineValue={headline.calmarRatio}
        />
      </div>
    </section>
  );
}
