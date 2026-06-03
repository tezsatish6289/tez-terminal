/**
 * Map freedombot /levels selections to TradingView advanced-chart widget params.
 * Reuses the same BINANCE / NSE conventions as the signal chart page (`ChartPane`).
 */

export type LevelsTvScope = "index" | "crypto" | "stock";

const CRYPTO_TV: Record<string, { exchange: string; symbol: string }> = {
  btc: { exchange: "BINANCE", symbol: "BTCUSDT" },
  eth: { exchange: "BINANCE", symbol: "ETHUSDT" },
  sol: { exchange: "BINANCE", symbol: "SOLUSDT" },
  xrp: { exchange: "BINANCE", symbol: "XRPUSDT" },
};

/** Default 5m — intraday levels context. */
export const LEVELS_TV_INTERVAL = "5";

/** NSE index keys → TradingView symbol (NSE option-chain id ≠ TV ticker). */
const NSE_INDEX_TV: Record<string, string> = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "NIFTY_MID_SELECT",
  NIFTYNXT50: "NIFTYNXT50",
};

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
    const upper = key.toUpperCase();
    return {
      exchange: "NSE",
      symbol: NSE_INDEX_TV[upper] ?? upper,
      interval: LEVELS_TV_INTERVAL,
    };
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
