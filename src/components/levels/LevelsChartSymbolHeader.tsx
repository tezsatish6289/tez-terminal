"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import {
  LevelsChartZoneMeta,
  type LevelsChartZoneMetaProps,
} from "@/components/levels/LevelsChartZoneMeta";
import {
  formatLevelsChartMeta,
  type LevelsTvConfig,
} from "@/lib/levels/tradingview-symbol";

/** Left column: symbol, company, interval · exchange (chart + slideshow chrome). */
export function LevelsChartSymbolHeader({
  symbol,
  subtitle,
  config,
  highConfidence = false,
  badge,
  zoneMeta,
  expiryPicker,
}: {
  symbol: string;
  /** Company or index label when different from ticker. */
  subtitle?: string | null;
  config: LevelsTvConfig;
  /** NSE option chain — verified source badge beside ticker. */
  highConfidence?: boolean;
  /** Volatility-regime chip rendered beside the ticker (display only). */
  badge?: ReactNode;
  /** Option-chain expiry + put/call cluster sizes (chart deep-dive). */
  zoneMeta?: LevelsChartZoneMetaProps | null;
  expiryPicker?: ReactNode;
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
        <span className="inline-flex items-center gap-1 min-w-0">
          <span className="truncate">{symbol}</span>
          {highConfidence ? (
            <span title="NSE option chain" aria-label="NSE option chain data source">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "#34d399" }} />
            </span>
          ) : null}
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </span>
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
      {zoneMeta ? <LevelsChartZoneMeta {...zoneMeta} /> : null}
      {expiryPicker ? <div className="mt-1">{expiryPicker}</div> : null}
    </div>
  );
}
