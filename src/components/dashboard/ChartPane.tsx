"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
}

export function ChartPane({ symbol = "BTCUSDT", interval = "15", exchange = "BINANCE" }: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const formattedSymbol = symbol.includes(":") ? symbol : `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
  const tvInterval = interval === "0" ? "1" : interval;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = "";

    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const script = document.createElement("script");
    script.src = "https://s.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: formattedSymbol,
      interval: tvInterval,
      timezone: userTz,
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#f1f3f6",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      width: "100%",
      height: "100%",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [mounted, formattedSymbol, tvInterval]);

  return (
    <div className="w-full h-full bg-background relative flex flex-col">
      <div className="flex-1 w-full h-full bg-background">
        {mounted ? (
          <div
            ref={containerRef}
            className="tradingview-widget-container w-full h-full"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="bg-accent/10 p-4 rounded-full border border-accent/20 animate-pulse-cyan">
              <Zap className="h-8 w-8 text-accent" />
            </div>
            <p className="text-muted-foreground text-sm animate-pulse">Initializing Terminal Bridge...</p>
          </div>
        )}
      </div>
    </div>
  );
}
