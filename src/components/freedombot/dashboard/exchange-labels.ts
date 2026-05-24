export const EXCHANGE_LABELS: Record<string, string> = {
  BYBIT: "Bybit",
  COINDCX: "CoinDCX",
  HYPERLIQUID: "Hyperliquid",
  BINANCE: "Binance",
  ZERODHA: "Zerodha",
  UPSTOX: "Upstox",
  ANGEL_ONE: "Angel One",
  DHAN: "Dhan",
};

export function exchangeLabel(exchange: string): string {
  return EXCHANGE_LABELS[exchange] ?? exchange;
}
