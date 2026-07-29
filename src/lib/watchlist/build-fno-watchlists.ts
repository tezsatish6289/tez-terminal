/**
 * NSE F&O Ideal Watchlist → TradingView upload (.txt).
 * Symbols: NSE:RELIANCE, NSE:NIFTY, NSE:NIFTY_MID_SELECT, …
 */

import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS, type IndexKey } from "@/lib/index-specs";
import { levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { TIER_B, tierOf } from "@/lib/nse/fno-universe";
import {
  invalidateFnoUniverseCache,
  loadFnoUniverse,
} from "@/lib/nse/fno-universe-runtime";
import type {
  FnoWatchlistBuildResult,
  FnoWatchlistKind,
  FnoWatchlistListId,
  FnoWatchlistListMeta,
  FnoWatchlistSymbolRow,
} from "@/lib/watchlist/fno-watchlist-types";
import { WATCHLIST_TV_MAX_SYMBOLS } from "@/lib/watchlist/venues";

export type {
  FnoWatchlistBuildResult,
  FnoWatchlistKind,
  FnoWatchlistListId,
  FnoWatchlistListMeta,
  FnoWatchlistSymbolRow,
} from "@/lib/watchlist/fno-watchlist-types";

/** Same path as `FNO_UNIVERSE_DOC` — kept local to avoid pulling sync module into this graph. */
const FNO_UNIVERSE_DOC = "config/fno_universe";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
let cache: { at: number; data: FnoWatchlistBuildResult } | null = null;

function toTradingViewTicker(kind: FnoWatchlistKind, symbol: string): string {
  const cfg = levelsTradingViewParams(kind, symbol);
  if (!cfg) throw new Error(`No TradingView mapping for ${kind}:${symbol}`);
  return cfg.fullSymbol;
}

function toTradingViewFile(tickers: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < tickers.length; i += WATCHLIST_TV_MAX_SYMBOLS) {
    lines.push(tickers.slice(i, i + WATCHLIST_TV_MAX_SYMBOLS).join(","));
  }
  return lines.length > 0 ? lines : [""];
}

function indexRows(): FnoWatchlistSymbolRow[] {
  return INDEX_KEYS.map((key: IndexKey) => ({
    symbol: key,
    kind: "index" as const,
    tier: null,
    tradingView: toTradingViewTicker("index", key),
    label: INDEX_SPECS[key].label,
  }));
}

function stockRows(universe: readonly string[]): FnoWatchlistSymbolRow[] {
  return universe.map((symbol) => ({
    symbol,
    kind: "stock" as const,
    tier: tierOf(symbol),
    tradingView: toTradingViewTicker("stock", symbol),
    label: symbol,
  }));
}

/**
 * Build NSE F&O watchlist downloads from runtime universe (Firestore, seed fallback).
 * @param forceRefresh bypass in-memory cache and reload universe
 */
export async function buildFnoWatchlists(forceRefresh = false): Promise<FnoWatchlistBuildResult> {
  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  if (forceRefresh) invalidateFnoUniverseCache();

  const db = getAdminFirestore();
  let source: "firestore" | "seed" = "seed";
  try {
    const snap = await db.doc(FNO_UNIVERSE_DOC).get();
    const raw = snap.data()?.symbols;
    if (Array.isArray(raw) && raw.length > 0) source = "firestore";
  } catch {
    /* seed fallback */
  }

  const universe = await loadFnoUniverse(db);

  const indices = indexRows();
  const stocks = stockRows(universe);
  const liquid = stocks.filter((r) => r.tier === "B");
  // Preserve Tier B order from TIER_B for liquid list
  const liquidOrdered = TIER_B.map((s) => liquid.find((r) => r.symbol === s)).filter(
    (r): r is FnoWatchlistSymbolRow => Boolean(r),
  );

  const allRows = [...indices, ...stocks];
  const listsSpec: {
    id: FnoWatchlistListId;
    label: string;
    description: string;
    rows: FnoWatchlistSymbolRow[];
  }[] = [
    {
      id: "all",
      label: "All (indices + stocks)",
      description: "NSE indices plus full F&O equity underlyings. Best default TradingView import.",
      rows: allRows,
    },
    {
      id: "indices",
      label: "Indices only",
      description: "Nifty 50, Bank Nifty, Fin Nifty, Midcap Nifty, Nifty Next 50.",
      rows: indices,
    },
    {
      id: "liquid",
      label: "Liquid stocks (Tier B)",
      description: "Most-liquid F&O single-stock underlyings — smaller focused list.",
      rows: liquidOrdered,
    },
    {
      id: "stocks",
      label: "All F&O stocks",
      description: "Full equity F&O universe (Tier B first, then the rest).",
      rows: stocks,
    },
  ];

  const downloads = {} as Record<FnoWatchlistListId, string[]>;
  const lists: FnoWatchlistListMeta[] = listsSpec.map((list) => {
    const tickers = list.rows.map((r) => r.tradingView);
    const parts = toTradingViewFile(tickers);
    downloads[list.id] = parts;
    return {
      id: list.id,
      label: list.label,
      description: list.description,
      count: list.rows.length,
      tradingViewParts: parts.length,
    };
  });

  const result: FnoWatchlistBuildResult = {
    generatedAt: new Date().toISOString(),
    source,
    stockCount: stocks.length,
    indexCount: indices.length,
    lists,
    rows: allRows,
    downloads,
  };

  cache = { at: Date.now(), data: result };
  return result;
}
