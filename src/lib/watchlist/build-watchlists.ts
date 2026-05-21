import { getConnector } from "@/lib/exchanges/registry";
import {
  canonicalSetFromInstrumentMap,
  sortCanonicalSymbols,
  toCanonicalPerp,
} from "@/lib/watchlist/canonical";
import {
  getActiveWatchlistVenueKeys,
  WATCHLIST_TV_CHART_EXCHANGE,
  WATCHLIST_TV_MAX_SYMBOLS,
  WATCHLIST_VENUES,
  type WatchlistVenueDef,
} from "@/lib/watchlist/venues";

export type WatchlistListId = "core" | "union" | "bybit_only";

export interface WatchlistSymbolRow {
  symbol: string;
  venues: Record<string, boolean>;
  inCore: boolean;
}

export interface WatchlistListMeta {
  id: WatchlistListId;
  label: string;
  description: string;
  count: number;
  tradingViewParts: number;
}

export interface WatchlistBuildResult {
  generatedAt: string;
  venues: WatchlistVenueDef[];
  activeVenueKeys: string[];
  venueCounts: Record<string, number>;
  venueErrors: Record<string, string>;
  lists: WatchlistListMeta[];
  rows: WatchlistSymbolRow[];
  downloads: Record<WatchlistListId, string[]>;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
let cache: { at: number; data: WatchlistBuildResult } | null = null;

async function fetchVenueSymbols(key: string): Promise<Set<string>> {
  const connector = getConnector(key);
  const map = await connector.getExchangeInfo(true, false);
  return canonicalSetFromInstrumentMap(map);
}

function intersect(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const out = new Set<string>();
  for (const s of first) {
    if (rest.every((set) => set.has(s))) out.add(s);
  }
  return out;
}

function union(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    for (const s of set) out.add(s);
  }
  return out;
}

function toTradingViewSymbol(canonical: string): string {
  const inner = canonical.replace(/\.P$/i, "");
  return `${WATCHLIST_TV_CHART_EXCHANGE}:${inner}.P`;
}

function toTradingViewFile(symbols: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < symbols.length; i += WATCHLIST_TV_MAX_SYMBOLS) {
    const chunk = symbols.slice(i, i + WATCHLIST_TV_MAX_SYMBOLS);
    lines.push(chunk.map(toTradingViewSymbol).join(","));
  }
  return lines;
}

/**
 * Build ideal watchlist data from live exchange instrument APIs.
 * @param forceRefresh bypass in-memory cache
 */
export async function buildWatchlists(forceRefresh = false): Promise<WatchlistBuildResult> {
  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const activeKeys = getActiveWatchlistVenueKeys();
  const venueSets: Record<string, Set<string>> = {};
  const venueErrors: Record<string, string> = {};

  await Promise.all(
    activeKeys.map(async (key) => {
      try {
        venueSets[key] = await fetchVenueSymbols(key);
      } catch (e: unknown) {
        venueErrors[key] = e instanceof Error ? e.message : String(e);
        venueSets[key] = new Set();
      }
    }),
  );

  const activeSets = activeKeys.map((k) => venueSets[k] ?? new Set());
  const coreSet = intersect(activeSets);
  const unionSet = union(activeSets);
  const bybitSet = venueSets.BYBIT ?? new Set();

  const bybitOnlySet = new Set<string>();
  for (const s of bybitSet) {
    if (!coreSet.has(s)) bybitOnlySet.add(s);
  }

  const allSymbols = sortCanonicalSymbols(unionSet);

  const rows: WatchlistSymbolRow[] = allSymbols.map((symbol) => {
    const venues: Record<string, boolean> = {};
    for (const key of activeKeys) {
      venues[key] = venueSets[key]?.has(symbol) ?? false;
    }
    return {
      symbol,
      venues,
      inCore: coreSet.has(symbol),
    };
  });

  const coreSorted = sortCanonicalSymbols(coreSet);
  const unionSorted = sortCanonicalSymbols(unionSet);
  const bybitOnlySorted = sortCanonicalSymbols(bybitOnlySet);

  const coreTv = toTradingViewFile(coreSorted);
  const unionTv = toTradingViewFile(unionSorted);
  const bybitOnlyTv = toTradingViewFile(bybitOnlySorted);

  const venueCounts: Record<string, number> = {};
  for (const key of activeKeys) {
    venueCounts[key] = venueSets[key]?.size ?? 0;
  }

  const result: WatchlistBuildResult = {
    generatedAt: new Date().toISOString(),
    venues: WATCHLIST_VENUES,
    activeVenueKeys: activeKeys,
    venueCounts,
    venueErrors,
    lists: [
      {
        id: "core",
        label: "Core (all active venues)",
        description: `Listed on every active venue: ${activeKeys.join(", ")}. Best for multi-exchange trading.`,
        count: coreSorted.length,
        tradingViewParts: coreTv.length,
      },
      {
        id: "union",
        label: "Union (any venue)",
        description: "On at least one active venue. Includes venue-only alts.",
        count: unionSorted.length,
        tradingViewParts: unionTv.length,
      },
      {
        id: "bybit_only",
        label: "Bybit only (not in Core)",
        description: "On Bybit but missing from at least one other active venue (often Hyperliquid).",
        count: bybitOnlySorted.length,
        tradingViewParts: bybitOnlyTv.length,
      },
    ],
    rows,
    downloads: {
      core: coreTv,
      union: unionTv,
      bybit_only: bybitOnlyTv,
    },
  };

  cache = { at: Date.now(), data: result };
  return result;
}

/** Parse a TradingView upload line back to canonical (for validation). */
export function tradingViewLineToCanonical(line: string): string | null {
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0];
  const colon = first.indexOf(":");
  const sym = colon >= 0 ? first.slice(colon + 1) : first;
  return toCanonicalPerp(sym);
}
