"use client";

import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import type { SimTrade } from "@/lib/simulator";
import {
  buildRatioSeries,
  calcPerformanceMetrics,
} from "@/lib/performance-metrics";
import { RatioDrilldownChart } from "./RatioDrilldownChart";
import { RatioExplainPanel } from "./RatioExplainPanel";

interface RiskRatioDrilldownsProps {
  trades: SimTrade[];
  startingCapital: number;
  assetType: string;
}

export function RiskRatioDrilldowns({
  trades,
  startingCapital,
  assetType,
}: RiskRatioDrilldownsProps) {
  const [view, setView] = useState<"trade" | "day">("trade");
  const riskFree = assetType === "INDIAN_STOCKS" ? 0.065 : 0;
  const riskFreeLabel =
    assetType === "INDIAN_STOCKS"
      ? "Risk-free: 6.5% (RBI)"
      : "Risk-free: 0% (crypto)";

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
    <section className="mt-10 pt-10 border-t border-white/[0.06] space-y-10">
      <div className="flex items-start justify-between gap-6 flex-wrap pb-2">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              Risk ratio drill-down
            </h2>
            <p className="text-[12px] text-muted-foreground/55 leading-relaxed max-w-xl">
              How Sharpe, Sortino, and Calmar evolved over your track record
            </p>
          </div>
        </div>
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
              className={
                view === v.key
                  ? "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent"
                  : "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground/75"
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sharpe: chart left, explain right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <RatioDrilldownChart
          ratioKey="sharpe"
          series={series}
          view={view}
          headlineValue={headline.sharpeRatio}
        />
        <RatioExplainPanel
          ratioKey="sharpe"
          tradingDays={headline.tradingDays}
          riskFreeLabel={riskFreeLabel}
        />
      </div>

      {/* Sortino: explain left, chart right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 pt-4">
        <RatioExplainPanel
          ratioKey="sortino"
          className="order-2 lg:order-1"
          tradingDays={headline.tradingDays}
          riskFreeLabel={riskFreeLabel}
        />
        <div className="order-1 lg:order-2">
          <RatioDrilldownChart
            ratioKey="sortino"
            series={series}
            view={view}
            headlineValue={headline.sortinoRatio}
          />
        </div>
      </div>

      {/* Calmar: chart left, explain right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 pt-4">
        <RatioDrilldownChart
          ratioKey="calmar"
          series={series}
          view={view}
          headlineValue={headline.calmarRatio}
        />
        <RatioExplainPanel
          ratioKey="calmar"
          tradingDays={headline.tradingDays}
          riskFreeLabel={riskFreeLabel}
        />
      </div>
    </section>
  );
}
