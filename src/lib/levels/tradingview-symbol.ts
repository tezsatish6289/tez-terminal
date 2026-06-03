/**
 * Map freedombot /levels selections to TradingView embed params.
 *
 * Crypto uses the advanced-chart widget (same as /chart signal page).
 * NSE stocks/indices use TradingView's widgetembed URL — many Indian tickers
 * (e.g. CDSL) are blocked in the free advanced-chart iframe with
 * "only available on TradingView".
 */

export type LevelsTvScope = "index" | "crypto" | "stock";

export type LevelsTvEmbed = "advanced" | "widgetembed";

export interface LevelsTvConfig {
  exchange: string;
  symbol: string;
  /** EXCHANGE:SYMBOL for TV (e.g. NSE:CDSL, BINANCE:BTCUSDT). */
  fullSymbol: string;
  interval: string;
  embed: LevelsTvEmbed;
  /** Full chart on tradingview.com when embed is restricted. */
  webChartUrl: string;
}

const CRYPTO_TV: Record<string, { exchange: string; symbol: string }> = {
  btc: { exchange: "BINANCE", symbol: "BTCUSDT" },
  eth: { exchange: "BINANCE", symbol: "ETHUSDT" },
  sol: { exchange: "BINANCE", symbol: "SOLUSDT" },
  xrp: { exchange: "BINANCE", symbol: "XRPUSDT" },
};

/** Default 5m — intraday levels context. */
export const LEVELS_TV_INTERVAL = "5";

/** NSE index keys → TradingView ticker (NSE option-chain id ≠ TV). */
const NSE_INDEX_TV: Record<string, string> = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "NIFTY_MID_SELECT",
  NIFTYNXT50: "NIFTYNXT50",
};

function fullSymbol(exchange: string, symbol: string): string {
  return `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
}

function webChartUrl(full: string, interval: string): string {
  const u = new URL("https://www.tradingview.com/chart/");
  u.searchParams.set("symbol", full);
  u.searchParams.set("interval", interval);
  return u.toString();
}

/** widgetembed — better NSE/BSE coverage than advanced-chart hash iframe. */
export function buildTradingViewWidgetEmbedUrl(
  tvSymbol: string,
  interval: string,
): string {
  const params = new URLSearchParams({
    symbol: tvSymbol.includes(":") ? tvSymbol : `NSE:${tvSymbol}`,
    interval: interval === "0" ? "1" : interval,
    hidesidetoolbar: "0",
    hideideas: "1",
    theme: "dark",
    style: "1",
    timezone: "Asia/Kolkata",
    withdateranges: "1",
    locale: "in",
    enable_publishing: "0",
    allow_symbol_change: "1",
    saveimage: "1",
  });
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
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
      fullSymbol: full,
      interval: LEVELS_TV_INTERVAL,
      embed: "advanced",
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
    };
  }

  if (scope === "index") {
    const upper = key.toUpperCase();
    const sym = NSE_INDEX_TV[upper] ?? upper;
    const exchange = "NSE";
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: sym,
      fullSymbol: full,
      interval: LEVELS_TV_INTERVAL,
      embed: "widgetembed",
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
    };
  }

  if (scope === "stock") {
    const sym = key.toUpperCase();
    const exchange = "NSE";
    const full = fullSymbol(exchange, sym);
    return {
      exchange,
      symbol: sym,
      fullSymbol: full,
      interval: LEVELS_TV_INTERVAL,
      embed: "widgetembed",
      webChartUrl: webChartUrl(full, LEVELS_TV_INTERVAL),
    };
  }

  return null;
}
