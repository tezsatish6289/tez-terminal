"use client";

import {
  formatLevelsChartMeta,
  type LevelsTvConfig,
} from "@/lib/levels/tradingview-symbol";

/** Left column: symbol, company, interval · exchange (chart + slideshow chrome). */
export function LevelsChartSymbolHeader({
  symbol,
  subtitle,
  config,
}: {
  symbol: string;
  /** Company or index label when different from ticker. */
  subtitle?: string | null;
  config: LevelsTvConfig;
}) {
  const showSubtitle =
    subtitle != null &&
    subtitle.trim().length > 0 &&
    subtitle.trim().toUpperCase() !== symbol.toUpperCase();

  return (
    <div className="min-w-0 flex-1 flex flex-col gap-0 leading-tight">
      <h1
        className="text-base sm:text-lg font-black tracking-tight truncate"
        style={{ color: "#f8fafc" }}
      >
        {symbol}
      </h1>
      {showSubtitle ? (
        <p
          className="text-[10px] sm:text-[11px] font-medium truncate"
          style={{ color: "#94a3b8" }}
        >
          {subtitle}
        </p>
      ) : null}
      <p
        className="text-[9px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "#64748b" }}
      >
        {formatLevelsChartMeta(config)}
      </p>
    </div>
  );
}
