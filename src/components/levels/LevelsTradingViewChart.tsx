"use client";

import { useEffect, useState } from "react";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  formatLevelsChartMeta,
  type LevelsTvConfig,
} from "@/lib/levels/tradingview-symbol";
import { BLACKBOARD_FIELD_BORDER } from "@/lib/levels/cta-blackboard";

/**
 * NSE stocks & indices → native Dhan candlestick chart with zone overlays.
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
  hideChartShortcuts,
  defaultFullHistory,
  nativeChartRef,
  onFullHistoryZoomChange,
  onLastCloseChange,
  showHeader = true,
  hideTvFooterHint = false,
  showBrandWatermark = true,
  className = "",
}: {
  config: LevelsTvConfig;
  /** NSE ticker / symbol (e.g. BANKINDIA, NIFTY). */
  ticker: string;
  /** Display name below ticker when different (e.g. Bank of India, Nifty 50). */
  companyName?: string;
  levels?: PublicLevels | null;
  loading?: boolean;
  showSlideshowControl?: boolean;
  slideshowPaused?: boolean;
  onToggleSlideshowPause?: () => void;
  hideChartShortcuts?: boolean;
  defaultFullHistory?: boolean;
  nativeChartRef?: React.RefObject<NativeCandlesChartHandle | null>;
  onFullHistoryZoomChange?: (full: boolean) => void;
  onLastCloseChange?: (close: number) => void;
  /** Deep-dive page: title lives in page chrome; chart fills remaining viewport. */
  showHeader?: boolean;
  /** Hide centred TradingView footer copy (e.g. homepage showcase). */
  hideTvFooterHint?: boolean;
  /** On-chart FNONINJA watermark. */
  showBrandWatermark?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const symbolTicker = ticker.trim() || config.symbol;
  const subName = companyName?.trim();
  const showCompany =
    subName != null &&
    subName.length > 0 &&
    subName.toUpperCase() !== symbolTicker.toUpperCase();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className={`flex flex-col min-h-0 h-full w-full ${className}`.trim()}>
      {showHeader ? (
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
      ) : null}
      <div
        className="relative flex-1 min-h-0 h-full w-full rounded-xl overflow-hidden max-md:min-h-[min(38dvh,360px)] max-md:touch-pan-y"
        style={{
          border: BLACKBOARD_FIELD_BORDER,
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        {!mounted ? (
          <div className="w-full h-full flex items-center justify-center" style={{ color: "#64748b" }}>
            <p className="text-xs">Loading chart…</p>
          </div>
        ) : (
          <NativeCandlesChart
            ref={nativeChartRef}
            symbol={config.symbol}
            candlesScope={config.candlesScope}
            interval={config.interval}
            levels={levels}
            loading={loading}
            webChartUrl={config.webChartUrl}
            showSlideshowControl={showSlideshowControl}
            slideshowPaused={slideshowPaused}
            onToggleSlideshowPause={onToggleSlideshowPause}
            hideShortcuts={hideChartShortcuts}
            hideTvFooterHint={hideTvFooterHint}
            defaultFullHistory={defaultFullHistory}
            showBrandWatermark={showBrandWatermark}
            onFullHistoryZoomChange={onFullHistoryZoomChange}
            onLastCloseChange={onLastCloseChange}
          />
        )}
      </div>
    </section>
  );
}
