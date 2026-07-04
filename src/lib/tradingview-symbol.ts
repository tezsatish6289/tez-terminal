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

export type TradingViewChartVariant = "signal" | "embed";

/**
 * Link to tradingview.com/chart (levels "Press T" / open full chart).
 * The colon in EXCHANGE:SYMBOL MUST stay literal — TradingView's chart router
 * mis-reads the encoded form (NSE%3AIRFC → invalid "3AIRFC") and fails to load.
 * So we build the query string by hand instead of URLSearchParams.
 * Indian symbols use in.tradingview.com (NSE/BSE/MCX).
 */
export function buildTradingViewWebChartUrl(tvSymbol: string, interval: string): string {
  const sym = tvSymbol.trim().toUpperCase();
  const tf = (interval.trim() || "15").replace(/[^0-9A-Za-z]/g, "");
  const india =
    sym.startsWith("NSE:") ||
    sym.startsWith("BSE:") ||
    sym.startsWith("MCX:") ||
    sym.startsWith("NSE_") ||
    sym.startsWith("BSE_");
  const origin = india ? "https://in.tradingview.com" : "https://www.tradingview.com";
  return `${origin}/chart/?symbol=${sym}&interval=${tf}`;
}

/**
 * signal → advanced-chart (same as /chart/[id]).
 * embed → widgetembed for India (better in cross-origin iframe on /embed/chart).
 */
export function buildTradingViewChartSrc(
  formattedSymbol: string,
  tvInterval: string,
  opts: { india: boolean; timezone: string; variant?: TradingViewChartVariant },
): string {
  const interval = tvInterval === "0" ? "1" : tvInterval;
  const variant = opts.variant ?? "signal";

  if (opts.india && variant === "embed") {
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      interval,
      theme: "dark",
      style: "1",
      timezone: opts.timezone,
      locale: "in",
      hideideas: "1",
      hidesidetoolbar: "0",
      allow_symbol_change: "1",
      withdateranges: "1",
      enable_publishing: "0",
      saveimage: "0",
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }

  const widgetConfig = {
    symbol: formattedSymbol,
    interval,
    timezone: opts.timezone,
    theme: "dark",
    style: "1",
    locale: opts.india ? "in" : "en",
    toolbar_bg: "#f1f3f6",
    enable_publishing: false,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    save_image: true,
    width: "100%",
    height: "100%",
  };

  return `https://s.tradingview.com/embed-widget/advanced-chart/?locale=${opts.india ? "in" : "en"}#${encodeURIComponent(JSON.stringify(widgetConfig))}`;
}

/**
 * Levels on freedombot.ai: India charts load via tezterminal.com/embed/chart.
 */
export function levelsIndianChartProxySrc(
  hostname: string,
  pathname: string,
  params: { symbol: string; exchange: string; interval: string },
): string | null {
  const host = hostname.toLowerCase();
  if (host === "tezterminal.com" || host === "www.tezterminal.com") return null;
  if (pathname.startsWith("/embed/chart")) return null;

  const tvSymbol = resolveTradingViewChartSymbol(params.symbol, params.exchange);

  const base =
    host === "freedombot.ai" ||
    host === "www.freedombot.ai" ||
    host === "fnoninja.com" ||
    host === "www.fnoninja.com"
      ? TEZ_TERMINAL_CHART_ORIGIN
      : typeof window !== "undefined"
        ? window.location.origin
        : TEZ_TERMINAL_CHART_ORIGIN;

  const u = new URL("/embed/chart", base);
  u.searchParams.set("tvSymbol", tvSymbol);
  u.searchParams.set("interval", params.interval);
  return u.toString();
}
