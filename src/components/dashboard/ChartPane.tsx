
"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

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

  const formattedSymbol = symbol.includes(":") ? symbol : `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
  const tvInterval = interval === "0" ? "1" : interval;

  const widgetConfig = JSON.stringify({
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

  return (
    <div className="w-full h-full bg-background relative flex flex-col">
      <div className="flex-1 w-full h-full bg-background">
        {mounted ? (
          <iframe
            key={`${formattedSymbol}-${tvInterval}-${userTz}`}
            src={`https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(widgetConfig)}`}
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
