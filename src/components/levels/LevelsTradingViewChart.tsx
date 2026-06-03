"use client";

import { ChartPane } from "@/components/dashboard/ChartPane";

/** Right column — fills available height beside list + levels. */
export function LevelsTradingViewChart({
  exchange,
  symbol,
  interval = "5",
  title,
}: {
  exchange: string;
  symbol: string;
  interval?: string;
  title?: string;
}) {
  return (
    <section className="flex flex-col min-h-0 h-full w-full">
      {title && (
        <p
          className="text-[9px] font-black uppercase tracking-[0.14em] py-1.5 px-0.5 shrink-0 truncate"
          style={{ color: "#64748b" }}
        >
          {title}
        </p>
      )}
      <div
        className="flex-1 min-h-0 w-full rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        <ChartPane symbol={symbol} exchange={exchange} interval={interval} />
      </div>
    </section>
  );
}
