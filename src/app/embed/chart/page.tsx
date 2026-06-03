"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChartPane } from "@/components/dashboard/ChartPane";

/** Minimal chart surface for cross-origin iframe (e.g. freedombot.ai/levels). */
function ChartEmbedInner() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") ?? "BTCUSDT";
  const exchange = sp.get("exchange") ?? "BINANCE";
  const interval = sp.get("interval") ?? "5";

  return (
    <div className="w-full h-[100dvh] min-h-[280px] bg-background">
      <ChartPane symbol={symbol} exchange={exchange} interval={interval} />
    </div>
  );
}

export default function ChartEmbedPage() {
  return (
    <Suspense
      fallback={<div className="w-full h-[100dvh] min-h-[280px] bg-background" aria-hidden />}
    >
      <ChartEmbedInner />
    </Suspense>
  );
}
