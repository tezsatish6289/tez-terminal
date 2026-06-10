export const TICKER_ORDER = [
  "FINNIFTY",
  "INDIA VIX",
  "MIDCPNIFTY",
  "SENSEX",
  "NIFTY",
  "BANKNIFTY",
] as const;

export type TickerLabel = (typeof TICKER_ORDER)[number];

export interface MarketTickerItem {
  label: TickerLabel;
  price: number | null;
  changePct: number | null;
}
