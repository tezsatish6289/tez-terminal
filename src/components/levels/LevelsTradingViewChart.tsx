"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelsTvConfig } from "@/lib/levels/tradingview-symbol";
import { levelsIndianChartProxySrc } from "@/lib/tradingview-symbol";

/**
 * NSE stocks → native Dhan candlestick chart (TradingView blocks NSE equity data).
 * Indices → tezterminal.com/embed/chart proxy. Crypto → ChartPane inline.
 */
export function LevelsTradingViewChart({
  config,
  title,
  levels,
}: {
  config: LevelsTvConfig;
  title?: string;
  levels?: PublicLevels | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [proxySrc, setProxySrc] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!config.indianMarket || config.nativeCandles) {
      setProxySrc(null);
      return;
    }
    setProxySrc(
      levelsIndianChartProxySrc(window.location.hostname, window.location.pathname, {
        symbol: config.symbol,
        exchange: config.exchange,
        interval: config.interval,
      }),
    );
  }, [config]);

  const showProxy = mounted && proxySrc;

  return (
    <section className="flex flex-col min-h-0 h-full w-full">
      <div className="flex items-center justify-between gap-2 shrink-0 py-1.5">
        {title && (
          <p
            className="text-[9px] font-black uppercase tracking-[0.14em] truncate min-w-0"
            style={{ color: "#64748b" }}
          >
            {title}
          </p>
        )}
        <a
          href={config.webChartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide shrink-0 hover:underline"
          style={{ color: "#93c5fd" }}
        >
          <ExternalLink className="h-3 w-3" />
          Open on TV
        </a>
      </div>
      <div
        className="flex-1 min-h-0 w-full rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        {!mounted ? (
          <div className="w-full h-full flex items-center justify-center" style={{ color: "#64748b" }}>
            <p className="text-xs">Loading chart…</p>
          </div>
        ) : config.nativeCandles ? (
          <NativeCandlesChart
            symbol={config.symbol}
            interval={config.interval}
            levels={levels}
          />
        ) : showProxy ? (
          <iframe
            key={proxySrc}
            title={`Chart ${config.fullSymbol}`}
            src={proxySrc}
            className="w-full h-full border-none"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <ChartPane
            symbol={config.symbol}
            exchange={config.exchange}
            interval={config.interval}
          />
        )}
      </div>
    </section>
  );
}
