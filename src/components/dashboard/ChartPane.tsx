"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import {
  buildTradingViewChartSrc,
  isIndianMarketExchange,
  resolveTradingViewChartSymbol,
  type TradingViewChartVariant,
} from "@/lib/tradingview-symbol";

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
  /** Full TV symbol (NSE:CDSL) — overrides symbol+exchange when set. */
  tvSymbol?: string;
  /** embed = levels iframe route (widgetembed for India). */
  variant?: TradingViewChartVariant;
}

export function ChartPane({
  symbol = "BTCUSDT",
  interval = "15",
  exchange = "BINANCE",
  tvSymbol: tvSymbolProp,
  variant = "signal",
}: ChartPaneProps) {
  const [mounted, setMounted] = useState(false);
  const india = isIndianMarketExchange(exchange) || (tvSymbolProp?.toUpperCase().startsWith("NSE") ?? false);
  const [userTz, setUserTz] = useState(india ? "Asia/Kolkata" : "Etc/UTC");

  const formattedSymbol = useMemo(
    () =>
      tvSymbolProp?.trim()
        ? resolveTradingViewChartSymbol(tvSymbolProp, exchange)
        : resolveTradingViewChartSymbol(symbol, exchange),
    [tvSymbolProp, symbol, exchange],
  );

  const tvInterval = interval === "0" ? "1" : interval;

  const src = useMemo(
    () =>
      buildTradingViewChartSrc(formattedSymbol, tvInterval, {
        india,
        timezone: userTz,
        variant,
      }),
    [formattedSymbol, tvInterval, india, userTz, variant],
  );

  useEffect(() => {
    setUserTz(
      india ? "Asia/Kolkata" : Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setMounted(true);
  }, [india]);

  return (
    <div className="w-full h-full bg-background relative flex flex-col">
      <div className="flex-1 w-full h-full bg-background">
        {mounted ? (
          <iframe
            key={src}
            title={`TradingView ${formattedSymbol}`}
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
