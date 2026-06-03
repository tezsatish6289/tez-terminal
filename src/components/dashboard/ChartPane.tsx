"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  isIndianMarketExchange,
  resolveTradingViewChartSymbol,
} from "@/lib/tradingview-symbol";

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
}

const TV_ADVANCED_CHART_SCRIPT =
  "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

export function ChartPane({ symbol = "BTCUSDT", interval = "15", exchange = "BINANCE" }: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const india = isIndianMarketExchange(exchange);
  const [userTz, setUserTz] = useState(india ? "Asia/Kolkata" : "Etc/UTC");

  const formattedSymbol = resolveTradingViewChartSymbol(symbol, exchange);
  const tvInterval = interval === "0" ? "1" : interval;

  useEffect(() => {
    setUserTz(
      isIndianMarketExchange(exchange)
        ? "Asia/Kolkata"
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setMounted(true);
  }, [exchange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!mounted || !el) return;

    el.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    el.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = TV_ADVANCED_CHART_SCRIPT;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: formattedSymbol,
      interval: tvInterval,
      timezone: userTz,
      theme: "dark",
      style: "1",
      locale: india ? "in" : "en",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);

    return () => {
      el.innerHTML = "";
    };
  }, [mounted, formattedSymbol, tvInterval, userTz, india]);

  return (
    <div className="w-full h-full bg-background relative flex flex-col">
      <div ref={containerRef} className="tradingview-widget-container flex-1 w-full h-full min-h-0">
        {!mounted && (
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
