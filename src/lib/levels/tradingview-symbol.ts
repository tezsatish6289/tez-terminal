/**
 * Map freedombot /levels selections to ChartPane params (same widget as /chart/[id]).
 * India charts on freedombot.ai load via tezterminal.com/embed/chart (see LevelsTradingViewChart).
 */

import type { IndexKey } from "@/lib/index-options-zones";

export type LevelsTvScope = "index" | "crypto" | "stock";

export interface LevelsTvConfig {
  /** Passed to ChartPane `exchange` prop. */
  exchange: string;
  symbol: string;
  interval: string;
  /** EXCHANGE:SYMBOL shown in UI + "Open on TV" link. */
  fullSymbol: string;
  webChartUrl: string;
  /** NSE/BSE/MCX — on freedombot.ai load chart via tezterminal.com embed proxy. */
  indianMarket: boolean;
}

const CRYPTO_TV: Record<string, { exchange: string; symbol: string }> = {
  btc: { exchange: "BINANCE", symbol: "BTCUSDT" },
  eth: { exchange: "BINANCE", symbol: "ETHUSDT" },
  sol: { exchange: "BINANCE", symbol: "SOLUSDT" },
  xrp: { exchange: "BINANCE", symbol: "XRPUSDT" },
};

/** Default 5m — intraday levels context. */
export const LEVELS_TV_INTERVAL = "5";

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

  if (scope === "crypto") {
    const row = CRYPTO_TV[key.toLowerCase()];
    const exchange = row?.exchange ?? "BINANCE";
    const sym =
      row?.symbol ??
      (key.toUpperCase().endsWith("USDT") ? key.toUpperCase() : `${key.toUpperCase()}USDT`);
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: sym,
      interval: LEVELS_TV_INTERVAL,
      fullSymbol: full,
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
      indianMarket: false,
    };
  }

  if (scope === "index") {
    const upper = key.toUpperCase() as IndexKey;
    const sym = NSE_INDEX_TV[upper] ?? upper;
    const exchange = TV_EXCHANGE_INDIA_INDEX;
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: sym,
      interval: LEVELS_TV_INTERVAL,
      fullSymbol: full,
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
      indianMarket: true,
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
    };
  }

  return null;
}
