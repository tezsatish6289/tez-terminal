/**
 * Exchanges covered by the Ideal Watchlist builder.
 *
 * ── When you integrate a new execution venue ─────────────────────────
 * 1. Implement `ExchangeConnector` and register it in `registry.ts`.
 * 2. Add a row below with `status: "active"` (or move from `planned`).
 * 3. Refresh Admin → Ideal Watchlist, or run `npm run watchlist:generate`.
 *
 * Venues not listed here are ignored for Core (multi-venue) intersection.
 * ─────────────────────────────────────────────────────────────────────
 */

export type WatchlistVenueStatus = "active" | "planned";

export interface WatchlistVenueDef {
  /** Must match `ExchangeName` in registry / connectors. */
  key: string;
  label: string;
  status: WatchlistVenueStatus;
  /** Shown in admin UI — margin currency, TV notes, etc. */
  notes?: string;
}

/** TradingView chart feed for generated upload files (not execution venue). */
export const WATCHLIST_TV_CHART_EXCHANGE = "BYBIT" as const;

/** TradingView max symbols per imported list. */
export const WATCHLIST_TV_MAX_SYMBOLS = 1000;

/**
 * All venues the watchlist system knows about.
 * Keep `planned` rows visible so you remember to activate them after integration.
 */
export const WATCHLIST_VENUES: WatchlistVenueDef[] = [
  {
    key: "BYBIT",
    label: "Bybit",
    status: "active",
    notes: "USDT linear perps; also used as TradingView chart proxy (BYBIT:…USDT.P).",
  },
  {
    key: "COINDCX",
    label: "CoinDCX",
    status: "active",
    notes: "USDT-margined futures (India). Not in TV CEX screener — listed via API here.",
  },
  {
    key: "HYPERLIQUID",
    label: "Hyperliquid",
    status: "active",
    notes: "USDC-margined perps; normalized to USDT.P for cross-venue matching.",
  },
  {
    key: "LIGHTER",
    label: "Lighter",
    status: "planned",
    notes: "Set status to active after LighterConnector + registry entry ship.",
  },
];

/** Venues that participate in live fetches and Core intersection. */
export function getActiveWatchlistVenueKeys(): string[] {
  return WATCHLIST_VENUES.filter((v) => v.status === "active").map((v) => v.key);
}

export function getWatchlistVenueDef(key: string): WatchlistVenueDef | undefined {
  return WATCHLIST_VENUES.find((v) => v.key === key);
}
