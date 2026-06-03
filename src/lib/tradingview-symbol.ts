/**
 * TradingView chart symbol resolution for embeds (ChartPane, /embed/chart).
 */

export function isIndianMarketExchange(exchange: string): boolean {
  const u = exchange.toUpperCase();
  return u.startsWith("NSE") || u.startsWith("BSE") || u.startsWith("MCX");
}

/** Free advanced-chart iframe: delayed India feeds (NSE_DLY), not plain NSE. */
export function tradingViewEmbedExchange(exchange: string): string {
  const u = exchange.toUpperCase();
  if (u === "NSE" || u === "NSE_EQ") return "NSE_DLY";
  if (u === "BSE" || u === "BSE_EQ") return "BSE_DLY";
  if (u.startsWith("NSE_") || u.startsWith("BSE_") || u.startsWith("MCX")) return u;
  return u;
}

/** EXCHANGE:SYMBOL passed to TradingView widgets (always remaps India → _DLY). */
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

/** Hosts where NSE embeds fail — load chart via tezterminal.com proxy iframe. */
export function shouldProxyIndianChartViaTezTerminal(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "freedombot.ai" || h === "www.freedombot.ai";
}

export const TEZ_TERMINAL_CHART_ORIGIN = "https://tezterminal.com";

export function tezTerminalChartEmbedUrl(params: {
  symbol: string;
  exchange: string;
  interval: string;
}): string {
  const u = new URL("/embed/chart", TEZ_TERMINAL_CHART_ORIGIN);
  u.searchParams.set("symbol", params.symbol);
  u.searchParams.set("exchange", params.exchange);
  u.searchParams.set("interval", params.interval);
  return u.toString();
}
