"use client";

import { LevelsCtaCluster } from "@/components/levels/LevelsCtaCluster";
import { openTradingViewChart } from "@/lib/levels/open-tradingview-chart";

/** One-click (and aria-labelled) TradingView opener for chart chrome. */
export function LevelsTradingViewOpenChip({
  webChartUrl,
  className = "",
}: {
  webChartUrl: string;
  className?: string;
}) {
  if (!webChartUrl.trim()) return null;

  return (
    <div className={className}>
      <LevelsCtaCluster
        actions={[
          {
            id: "tv",
            label: "TradingView",
            kbd: "T",
            tone: "default-muted",
            onClick: () => openTradingViewChart(webChartUrl),
            ariaLabel: "Open this chart on TradingView in a new tab. Press T or click.",
          },
        ]}
      />
    </div>
  );
}
