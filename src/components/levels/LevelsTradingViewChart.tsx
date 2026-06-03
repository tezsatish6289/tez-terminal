"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Zap } from "lucide-react";
import { ChartPane } from "@/components/dashboard/ChartPane";
import {
  buildTradingViewWidgetEmbedUrl,
  type LevelsTvConfig,
} from "@/lib/levels/tradingview-symbol";

/** Right column — fills available height beside list + levels. */
export function LevelsTradingViewChart({
  config,
  title,
}: {
  config: LevelsTvConfig;
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const embedSrc =
    config.embed === "widgetembed"
      ? buildTradingViewWidgetEmbedUrl(config.fullSymbol, config.interval)
      : null;

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
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="bg-accent/10 p-3 rounded-full border border-accent/20 animate-pulse">
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <p className="text-xs" style={{ color: "#64748b" }}>
              Loading chart…
            </p>
          </div>
        ) : config.embed === "widgetembed" && embedSrc ? (
          <iframe
            key={embedSrc}
            title={`TradingView ${config.fullSymbol}`}
            src={embedSrc}
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
