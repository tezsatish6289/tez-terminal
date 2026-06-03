"use client";

import { useEffect, useState } from "react";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { resolveTradingViewChartSymbol } from "@/lib/tradingview-symbol";

function readEmbedParams(): {
  tvSymbol: string;
  exchange: string;
  symbol: string;
  interval: string;
} {
  if (typeof window === "undefined") {
    return { tvSymbol: "BINANCE:BTCUSDT", exchange: "BINANCE", symbol: "BTCUSDT", interval: "5" };
  }
  const q = new URLSearchParams(window.location.search);
  const tvSymbolParam = q.get("tvSymbol");
  const symbol = q.get("symbol") ?? "BTCUSDT";
  const exchange = q.get("exchange") ?? "BINANCE";
  const interval = q.get("interval") ?? "5";
  const tvSymbol =
    tvSymbolParam?.trim() ||
    resolveTradingViewChartSymbol(symbol, exchange);
  const [ex, sym] = tvSymbol.includes(":")
    ? (tvSymbol.split(":", 2) as [string, string])
    : [exchange, symbol];
  return { tvSymbol, exchange: ex, symbol: sym, interval };
}

/** Minimal chart for cross-origin iframe (freedombot.ai/levels → tezterminal.com). */
export default function ChartEmbedPage() {
  const [params, setParams] = useState<ReturnType<typeof readEmbedParams> | null>(null);

  useEffect(() => {
    setParams(readEmbedParams());
  }, []);

  if (!params) {
    return <div className="w-full h-[100dvh] min-h-[280px] bg-background" aria-hidden />;
  }

  return (
    <div className="w-full h-[100dvh] min-h-[280px] bg-background">
      <ChartPane
        variant="embed"
        tvSymbol={params.tvSymbol}
        symbol={params.symbol}
        exchange={params.exchange}
        interval={params.interval}
      />
    </div>
  );
}
