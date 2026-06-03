"use client";

import { ChartPane } from "@/components/dashboard/ChartPane";

export function LevelsTradingViewChart({
  exchange,
  symbol,
  interval = "5",
}: {
  exchange: string;
  symbol: string;
  interval?: string;
}) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full w-full rounded-lg overflow-hidden"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
    >
      <ChartPane symbol={symbol} exchange={exchange} interval={interval} />
    </div>
  );
}
