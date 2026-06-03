"use client";

import { useEffect, useState } from "react";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { LevelsChartShortcuts } from "@/components/levels/LevelsChartShortcuts";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  formatLevelsChartMeta,
  type LevelsTvConfig,
} from "@/lib/levels/tradingview-symbol";
import { levelsIndianChartProxySrc } from "@/lib/tradingview-symbol";

/**
 * NSE stocks → native Dhan candlestick chart (TradingView blocks NSE equity data).
 * Indices → tezterminal.com/embed/chart proxy. Crypto → ChartPane inline.
 */
export function LevelsTradingViewChart({
  config,
  ticker,
  companyName,
  levels,
  loading,
  showSlideshowControl,
  slideshowPaused,
  onToggleSlideshowPause,
}: {
  config: LevelsTvConfig;
  /** NSE ticker / symbol (e.g. BANKINDIA). */
  ticker: string;
  /** Display name below ticker when different (e.g. Bank of India). */
  companyName?: string;
  levels?: PublicLevels | null;
  loading?: boolean;
  showSlideshowControl?: boolean;
  slideshowPaused?: boolean;
  onToggleSlideshowPause?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [proxySrc, setProxySrc] = useState<string | null>(null);
  const [chartFading, setChartFading] = useState(false);

  const chartKey = `${config.exchange}:${config.symbol}:${config.interval}:${config.nativeCandles ? "native" : "tv"}`;
  const symbolTicker = ticker.trim() || config.symbol;
  const subName = companyName?.trim();
  const showCompany =
    subName != null &&
    subName.length > 0 &&
    subName.toUpperCase() !== symbolTicker.toUpperCase();

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

  useEffect(() => {
    setChartFading(true);
    const id = window.setTimeout(() => setChartFading(false), 320);
    return () => window.clearTimeout(id);
  }, [chartKey]);

  const showProxy = mounted && proxySrc;

  return (
    <section className="flex flex-col min-h-0 h-full w-full">
      <div className="flex items-start justify-between gap-3 shrink-0 pb-2">
        <div className="min-w-0">
          <h2
            className="text-base sm:text-lg font-black tracking-tight truncate"
            style={{ color: "#f8fafc" }}
          >
            {symbolTicker}
          </h2>
          {showCompany && (
            <p
              className="mt-0.5 text-[11px] sm:text-xs font-medium truncate"
              style={{ color: "#94a3b8" }}
            >
              {subName}
            </p>
          )}
        </div>
        <p
          className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] shrink-0 text-right leading-snug pt-0.5"
          style={{ color: "#64748b" }}
        >
          {formatLevelsChartMeta(config)}
        </p>
      </div>
      <div
        className="relative flex-1 min-h-0 w-full rounded-xl overflow-hidden transition-opacity duration-300 ease-in-out"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(0,0,0,0.45)",
          opacity: chartFading ? 0.38 : 1,
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
            loading={loading}
            webChartUrl={config.webChartUrl}
            showSlideshowControl={showSlideshowControl}
            slideshowPaused={slideshowPaused}
            onToggleSlideshowPause={onToggleSlideshowPause}
          />
        ) : showProxy ? (
          <>
            <iframe
              key={chartKey}
              title={`Chart ${config.fullSymbol}`}
              src={proxySrc}
              className="w-full h-full border-none"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
            <LevelsChartShortcuts
              webChartUrl={config.webChartUrl}
              showSlideshowControl={showSlideshowControl}
              slideshowPaused={slideshowPaused}
              onToggleSlideshowPause={onToggleSlideshowPause}
            />
          </>
        ) : (
          <>
            <ChartPane
              symbol={config.symbol}
              exchange={config.exchange}
              interval={config.interval}
            />
            <LevelsChartShortcuts
              webChartUrl={config.webChartUrl}
              showSlideshowControl={showSlideshowControl}
              slideshowPaused={slideshowPaused}
              onToggleSlideshowPause={onToggleSlideshowPause}
            />
          </>
        )}
      </div>
    </section>
  );
}
