"use client";

import { useEffect, useState } from "react";
import { Zap, ExternalLink } from "lucide-react";

const STOCK_EXCHANGES = new Set(["NSE", "BSE", "MCX"]);

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
}

export function ChartPane({ symbol = "BTCUSDT", interval = "15", exchange = "BINANCE" }: ChartPaneProps) {
  const [mounted, setMounted] = useState(false);
  const [userTz, setUserTz] = useState("Etc/UTC");

  useEffect(() => {
    setUserTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMounted(true);
  }, []);

  const upperExchange = exchange.toUpperCase();
  const isStock = STOCK_EXCHANGES.has(upperExchange);
  const formattedSymbol = symbol.includes(":") ? symbol : `${upperExchange}:${symbol.toUpperCase()}`;
  const tvInterval = interval === "0" ? "1" : interval;
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${formattedSymbol}&interval=${tvInterval}`;

  if (isStock) {
    return (
      <div className="w-full h-full bg-background relative flex flex-col items-center justify-center gap-4">
        <div className="bg-accent/10 p-4 rounded-full border border-accent/20">
          <Zap className="h-8 w-8 text-accent" />
        </div>
        <div className="text-center space-y-2 max-w-xs">
          <p className="text-sm font-bold text-foreground/80">{formattedSymbol}</p>
          <p className="text-xs text-muted-foreground/60">
            Indian stock charts are not available in the embedded widget.
          </p>
          <a
            href={tradingViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 mt-2 rounded-lg border border-accent/30 bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/20 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open on TradingView
          </a>
        </div>
      </div>
    );
  }

  const widgetConfig = {
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
  };

  const src = `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(widgetConfig))}`;

  return (
    <div className="w-full h-full bg-background relative flex flex-col">
      <div className="flex-1 w-full h-full bg-background">
        {mounted ? (
          <iframe
            key={`${formattedSymbol}-${tvInterval}-${userTz}`}
            src={src}
            className="w-full h-full border-none"
            allowFullScreen
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
