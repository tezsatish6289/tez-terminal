"use client";

import type { ReactNode, RefObject } from "react";
import { LevelsChartPageToolbar } from "@/components/levels/LevelsChartPageToolbar";
import { LevelsChartSymbolHeader } from "@/components/levels/LevelsChartSymbolHeader";
import type { LevelsChartZoneMetaProps } from "@/components/levels/LevelsChartZoneMeta";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import type { LevelsTvConfig } from "@/lib/levels/tradingview-symbol";

/** Chart page + slideshow: symbol block left, action chips right. */
export function LevelsChartChrome({
  symbol,
  subtitle,
  config,
  nativeChartRef,
  chartFullHistory,
  onBubblesClick,
  bubblesLabel,
  bubblesShortLabel,
  bubblesTitle,
  hideToolbar = false,
  symbolSearch,
  highConfidence = false,
  badge,
  zoneMeta,
  expiryPicker,
  headerTrailing,
  className = "",
}: {
  symbol: string;
  subtitle?: string | null;
  config: LevelsTvConfig;
  nativeChartRef: RefObject<NativeCandlesChartHandle | null>;
  chartFullHistory: boolean;
  onBubblesClick?: () => void;
  bubblesLabel?: string;
  bubblesShortLabel?: string;
  bubblesTitle?: string;
  /** Slideshow: symbol header only (no TradingView / 30-day toolbar pills). */
  hideToolbar?: boolean;
  /** Chart deep-dive: symbol jump search beside header when toolbar is hidden. */
  symbolSearch?: ReactNode;
  highConfidence?: boolean;
  /** Volatility-regime chip rendered beside the ticker (display only). */
  badge?: ReactNode;
  zoneMeta?: LevelsChartZoneMetaProps | null;
  /** Index charts: expiry picker rendered under the symbol header. */
  expiryPicker?: ReactNode;
  /** Slideshow: action chip top-right when toolbar is hidden (e.g. remove from favslide). */
  headerTrailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`shrink-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-x-2 min-w-0 ${className}`.trim()}
    >
      <LevelsChartSymbolHeader
        symbol={symbol}
        subtitle={subtitle}
        config={config}
        highConfidence={highConfidence}
        badge={badge}
        zoneMeta={zoneMeta}
        expiryPicker={expiryPicker}
      />
      {!hideToolbar ? (
        <LevelsChartPageToolbar
          webChartUrl={config.webChartUrl}
          nativeChartRef={nativeChartRef}
          chartFullHistory={chartFullHistory}
          onBubblesClick={onBubblesClick}
          bubblesLabel={bubblesLabel}
          bubblesShortLabel={bubblesShortLabel}
          bubblesTitle={bubblesTitle}
        />
      ) : headerTrailing ? (
        <div className="shrink-0 self-start sm:ml-auto">{headerTrailing}</div>
      ) : symbolSearch ? (
        <div className="shrink-0 self-start">{symbolSearch}</div>
      ) : null}
    </div>
  );
}
