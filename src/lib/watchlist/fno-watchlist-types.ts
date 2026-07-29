/** Client-safe types for Ideal Watchlist → F&O TradingView export. */

export type FnoWatchlistListId = "all" | "indices" | "liquid" | "stocks";

export type FnoWatchlistKind = "index" | "stock";

export interface FnoWatchlistSymbolRow {
  symbol: string;
  kind: FnoWatchlistKind;
  tier: "B" | "C" | null;
  tradingView: string;
  label: string;
}

export interface FnoWatchlistListMeta {
  id: FnoWatchlistListId;
  label: string;
  description: string;
  count: number;
  tradingViewParts: number;
}

export interface FnoWatchlistBuildResult {
  generatedAt: string;
  source: "firestore" | "seed";
  stockCount: number;
  indexCount: number;
  lists: FnoWatchlistListMeta[];
  rows: FnoWatchlistSymbolRow[];
  downloads: Record<FnoWatchlistListId, string[]>;
}
