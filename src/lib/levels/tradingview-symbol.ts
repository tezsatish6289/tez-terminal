/**
 * Map freedombot /levels selections to chart params.
 * NSE stocks & indices → native Dhan candles; TV link for full chart in new tab.
 */

import type { IndexKey } from "@/lib/index-specs";

export type LevelsTvScope = "index" | "stock";

export interface LevelsTvConfig {
  /** Passed to ChartPane `exchange` prop (TV embed fallback only). */
  exchange: string;
  symbol: string;
  interval: string;
  /** EXCHANGE:SYMBOL shown in UI + "Open on TV" link. */
  fullSymbol: string;
  webChartUrl: string;
  /** NSE — native Dhan chart (no tezterminal embed). */
  indianMarket: boolean;
  /** Render native Dhan candlestick chart with zone overlays. */
  nativeCandles: boolean;
  /** Dhan segment for /api/freedombot/levels/candles. */
  candlesScope: "stock" | "index";
}

/** Default 15m — matches OI zone refresh cadence; less noise than 5m. */
export const LEVELS_TV_INTERVAL = "15";

/** UI label for chart header (e.g. 15 → "15M", 60 → "1H"). */
export function formatLevelsIntervalLabel(interval: string): string {
  const n = Number(interval);
  if (n === 60) return "1H";
  if (Number.isFinite(n) && n > 0) return `${n}M`;
  return interval.toUpperCase();
}

export function formatLevelsChartMeta(config: Pick<LevelsTvConfig, "interval" | "fullSymbol">): string {
  return `${formatLevelsIntervalLabel(config.interval)} · ${config.fullSymbol}`;
}

/** NSE index keys → TradingView ticker (option-chain id ≠ TV). */
const NSE_INDEX_TV: Record<IndexKey, string> = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "NIFTY_MID_SELECT",
  NIFTYNXT50: "NIFTYNXT50",
};

const TV_EXCHANGE_INDIA_INDEX = "NSE";
const TV_EXCHANGE_INDIA_STOCK = "NSE";

function fullSymbol(exchange: string, symbol: string): string {
  return `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
}

function webChartUrl(full: string, interval: string): string {
  const u = new URL("https://www.tradingview.com/chart/");
  u.searchParams.set("symbol", full);
  u.searchParams.set("interval", interval);
  return u.toString();
}

export function levelsTradingViewParams(
  scope: LevelsTvScope,
  symbol: string,
): LevelsTvConfig | null {
  const key = symbol.trim();
  if (!key) return null;

  if (scope === "index") {
    const upper = key.toUpperCase() as IndexKey;
    const sym = NSE_INDEX_TV[upper] ?? upper;
    const exchange = TV_EXCHANGE_INDIA_INDEX;
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: upper,
      interval: LEVELS_TV_INTERVAL,
      fullSymbol: full,
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
      indianMarket: true,
      nativeCandles: true,
      candlesScope: "index",
    };
  }

  if (scope === "stock") {
    const sym = key.toUpperCase();
    const exchange = TV_EXCHANGE_INDIA_STOCK;
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: sym,
      interval: LEVELS_TV_INTERVAL,
      fullSymbol: full,
      webChartUrl: webChartUrl(fullSymbol("NSE", sym), LEVELS_TV_INTERVAL),
      indianMarket: true,
      nativeCandles: true,
      candlesScope: "stock",
    };
  }

  return null;
}
