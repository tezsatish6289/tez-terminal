"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
}

function isIndianMarketExchange(exchange: string): boolean {
  const u = exchange.toUpperCase();
  return u.startsWith("NSE") || u.startsWith("BSE") || u.startsWith("MCX");
}

/**
 * Free TradingView advanced-chart iframe accepts delayed Indian feeds (NSE_DLY).
 * Plain NSE:SYMBOL often shows "only available on TradingView".
 */
function tradingViewEmbedExchange(exchange: string): string {
  const u = exchange.toUpperCase();
  if (u === "NSE" || u === "NSE_EQ") return "NSE_DLY";
  if (u === "BSE" || u === "BSE_EQ") return "BSE_DLY";
  if (u.startsWith("NSE_") || u.startsWith("BSE_") || u.startsWith("MCX")) return u;
  return u;
}

export function ChartPane({ symbol = "BTCUSDT", interval = "15", exchange = "BINANCE" }: ChartPaneProps) {
  const [mounted, setMounted] = useState(false);
  const india = isIndianMarketExchange(exchange);
  const [userTz, setUserTz] = useState(india ? "Asia/Kolkata" : "Etc/UTC");

  useEffect(() => {
    setUserTz(
      isIndianMarketExchange(exchange)
        ? "Asia/Kolkata"
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setMounted(true);
  }, [exchange]);

  const embedExchange = tradingViewEmbedExchange(exchange);
  const formattedSymbol = symbol.includes(":")
    ? symbol
    : `${embedExchange}:${symbol.toUpperCase()}`;
  const tvInterval = interval === "0" ? "1" : interval;

  const widgetConfig = {
    symbol: formattedSymbol,
    interval: tvInterval,
    timezone: userTz,
    theme: "dark",
    style: "1",
    locale: india ? "in" : "en",
    toolbar_bg: "#f1f3f6",
    enable_publishing: false,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    save_image: true,
    width: "100%",
    height: "100%",
  };

  const src = `https://s.tradingview.com/embed-widget/advanced-chart/?locale=${india ? "in" : "en"}#${encodeURIComponent(JSON.stringify(widgetConfig))}`;

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
