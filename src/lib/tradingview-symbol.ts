/**
 * TradingView chart symbol resolution for embeds (ChartPane, /embed/chart).
 */

export function isIndianMarketExchange(exchange: string): boolean {
  const u = exchange.toUpperCase();
  return u.startsWith("NSE") || u.startsWith("BSE") || u.startsWith("MCX");
}

/** Canonical TV exchange prefix (NSE_DLY → NSE for widget candle data). */
export function tradingViewEmbedExchange(exchange: string): string {
  const u = exchange.toUpperCase();
  if (u.startsWith("NSE")) return "NSE";
  if (u.startsWith("BSE")) return "BSE";
  if (u.startsWith("MCX")) return "MCX";
  return u;
}

/** EXCHANGE:SYMBOL for TradingView widgets — always NSE:RELIANCE, not NSE_DLY. */
export function resolveTradingViewChartSymbol(symbol: string, exchange: string): string {
  const s = symbol.trim();
  const ex = exchange.trim();
  if (s.includes(":")) {
    const idx = s.indexOf(":");
    const symEx = s.slice(0, idx);
    const symName = s.slice(idx + 1);
    return `${tradingViewEmbedExchange(symEx)}:${symName.toUpperCase()}`;
  }
  return `${tradingViewEmbedExchange(ex)}:${s.toUpperCase()}`;
}

export const TEZ_TERMINAL_CHART_ORIGIN = "https://tezterminal.com";

/**
 * Levels / freedombot: load India charts through tezterminal.com (TV allows NSE there).
 * Returns null when chart should render inline (crypto, or already on tezterminal).
 */
export function levelsIndianChartProxySrc(
  hostname: string,
  pathname: string,
  params: { symbol: string; exchange: string; interval: string },
): string | null {
  const host = hostname.toLowerCase();
  if (host === "tezterminal.com" || host === "www.tezterminal.com") return null;
  if (pathname.startsWith("/embed/chart")) return null;

  const base =
    host === "freedombot.ai" || host === "www.freedombot.ai"
      ? TEZ_TERMINAL_CHART_ORIGIN
      : typeof window !== "undefined"
        ? window.location.origin
        : TEZ_TERMINAL_CHART_ORIGIN;

  const u = new URL("/embed/chart", base);
  u.searchParams.set("symbol", params.symbol);
  u.searchParams.set("exchange", params.exchange);
  u.searchParams.set("interval", params.interval);
  return u.toString();
}
