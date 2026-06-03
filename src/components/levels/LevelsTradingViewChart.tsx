"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { ChartPane } from "@/components/dashboard/ChartPane";
import type { LevelsTvConfig } from "@/lib/levels/tradingview-symbol";
import { levelsIndianChartProxySrc } from "@/lib/tradingview-symbol";

/**
 * India charts on freedombot.ai → iframe tezterminal.com/embed/chart (same TV allowlist as /chart/[id]).
 * Crypto renders ChartPane inline.
 */
export function LevelsTradingViewChart({
  config,
  title,
}: {
  config: LevelsTvConfig;
  title?: string;
}) {
  const proxySrc = useMemo(() => {
    if (!config.indianMarket || typeof window === "undefined") return null;
    return levelsIndianChartProxySrc(window.location.hostname, window.location.pathname, {
      symbol: config.symbol,
      exchange: config.exchange,
      interval: config.interval,
    });
  }, [config]);

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
        {proxySrc ? (
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
