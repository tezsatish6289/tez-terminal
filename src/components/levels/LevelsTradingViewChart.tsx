"use client";

import { ChartPane } from "@/components/dashboard/ChartPane";

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
    <section
      className="w-full flex flex-col min-h-0 shrink-0"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      {title && (
        <p
          className="text-[9px] font-black uppercase tracking-[0.14em] py-2 px-0.5 shrink-0"
          style={{ color: "#64748b" }}
        >
          {title}
        </p>
      )}
      <div
        className="w-full rounded-xl overflow-hidden"
        style={{
          height: "min(42vh, 420px)",
          minHeight: 280,
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        <ChartPane symbol={symbol} exchange={exchange} interval={interval} />
      </div>
    </section>
  );
}
