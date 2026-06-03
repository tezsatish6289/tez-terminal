/**
 * Map freedombot /levels selections to TradingView advanced-chart widget params.
 * Reuses the same BINANCE / NSE conventions as the signal chart page (`ChartPane`).
 */

import type { IndexKey } from "@/lib/index-options-zones";

export type LevelsTvScope = "index" | "crypto" | "stock";

/** NSE internal keys → TradingView symbol (NSE: prefix added by ChartPane). */
const NSE_INDEX_TV: Record<IndexKey, string> = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "NIFTY_MID_SELECT",
  NIFTYNXT50: "NIFTY_NEXT_50",
};

const CRYPTO_TV: Record<string, { exchange: string; symbol: string }> = {
  btc: { exchange: "BINANCE", symbol: "BTCUSDT" },
  eth: { exchange: "BINANCE", symbol: "ETHUSDT" },
  sol: { exchange: "BINANCE", symbol: "SOLUSDT" },
  xrp: { exchange: "BINANCE", symbol: "XRPUSDT" },
};

/** Default 5m — intraday levels context. */
export const LEVELS_TV_INTERVAL = "5";

export function levelsTradingViewParams(
  scope: LevelsTvScope,
  symbol: string,
): { exchange: string; symbol: string; interval: string } | null {
  const key = symbol.trim();
  if (!key) return null;

  if (scope === "crypto") {
    const row = CRYPTO_TV[key.toLowerCase()];
    if (row) return { ...row, interval: LEVELS_TV_INTERVAL };
    return {
      exchange: "BINANCE",
      symbol: key.toUpperCase().endsWith("USDT") ? key.toUpperCase() : `${key.toUpperCase()}USDT`,
      interval: LEVELS_TV_INTERVAL,
    };
  }

  if (scope === "index") {
    const tv =
      NSE_INDEX_TV[key.toUpperCase() as IndexKey] ?? key.toUpperCase();
    return { exchange: "NSE", symbol: tv, interval: LEVELS_TV_INTERVAL };
  }

  if (scope === "stock") {
    return {
      exchange: "NSE",
      symbol: key.toUpperCase(),
      interval: LEVELS_TV_INTERVAL,
    };
  }

  return null;
}
