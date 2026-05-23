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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
              Risk ratio drill-down
            </h2>
            <p className="text-[10px] text-muted-foreground/45 mt-0.5">
              How Sharpe, Sortino, and Calmar evolved over your track record
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-md p-0.5 bg-white/[0.04] border border-white/[0.06]">
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
                  ? "px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent/20 text-accent"
                  : "px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider text-muted-foreground/45 hover:text-muted-foreground/70"
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sharpe: chart left, explain right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
