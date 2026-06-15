/**
 * NSE F&O stock universe (the equities listed on nseindia.com/option-chain).
 *
 * Ordered by liquidity tier so the round-robin queue always refreshes the names
 * people care about first:
 *   • TIER_B — most-liquid single stocks (front of the queue every cycle).
 *   • TIER_C — the long tail (rotated through over multiple runs).
 *
 * The live list is synced daily to Firestore (`config/fno_universe`) from NSE FO
 * pre-open + Dhan scrip master. The arrays below are the bootstrap seed when no
 * sync has run yet, and TIER_B defines refresh priority for any symbol list.
 */

/** Highly-liquid F&O single stocks — refreshed first, used as the default "hot" tier. */
export const TIER_B: readonly string[] = [
  "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN", "AXISBANK",
  "KOTAKBANK", "BHARTIARTL", "ITC", "LT", "HINDUNILVR", "BAJFINANCE",
  "MARUTI", "TATAMOTORS", "TATASTEEL", "SUNPHARMA", "WIPRO", "HCLTECH",
  "ADANIENT", "ADANIPORTS", "TITAN", "ULTRACEMCO", "ASIANPAINT", "POWERGRID",
  "NTPC", "BAJAJFINSV", "M&M", "JSWSTEEL", "ONGC",
];

/** The remainder of the F&O universe (rotated through the queue over time). */
export const TIER_C: readonly string[] = [
  "360ONE", "ABB", "ABCAPITAL", "ADANIENSOL", "ADANIGREEN", "ADANIPOWER",
  "ALKEM", "AMBER", "AMBUJACEM", "ANGELONE", "APLAPOLLO", "APOLLOHOSP",
  "ASHOKLEY", "ASTRAL", "AUBANK", "AUROPHARMA", "BAJAJ-AUTO", "BAJAJHLDNG",
  "BANDHANBNK", "BANKBARODA", "BANKINDIA", "BDL", "BEL", "BHARATFORG",
  "BHEL", "BIOCON", "BLUESTARCO", "BOSCHLTD", "BPCL", "BRITANNIA",
  "BSE", "CAMS", "CANBK", "CDSL", "CGPOWER", "CHOLAFIN", "CIPLA",
  "COALINDIA", "COFORGE", "COLPAL", "CONCOR", "CROMPTON", "CUMMINSIND",
  "CYIENT", "DABUR", "DALBHARAT", "DELHIVERY", "DIVISLAB", "DIXON",
  "DLF", "DMART", "DRREDDY", "EICHERMOT", "ESCORTS", "EXIDEIND",
  "FEDERALBNK", "GAIL", "GLENMARK", "GMRAIRPORT", "GODREJCP", "GODREJPROP",
  "GRASIM", "HAL", "HAVELLS", "HDFCAMC", "HDFCLIFE", "HEROMOTOCO",
  "HINDALCO", "HINDPETRO", "ICICIGI", "ICICIPRULI", "IDEA", "IDFCFIRSTB",
  "IEX", "IGL", "INDHOTEL", "INDIANB", "INDIGO", "INDUSINDBK", "INDUSTOWER",
  "IOC", "IRCTC", "IREDA", "IRFC", "JINDALSTEL", "JIOFIN", "JUBLFOOD",
  "KALYANKJIL", "KEI", "KPITTECH", "LAURUSLABS", "LICHSGFIN", "LICI",
  "LODHA", "LTF", "LTIM", "LUPIN", "MANAPPURAM", "MARICO", "MAXHEALTH",
  "MCX", "MFSL", "MGL", "MOTHERSON", "MPHASIS", "MRF", "MUTHOOTFIN",
  "NATIONALUM", "NAUKRI", "NESTLEIND", "NMDC", "NYKAA", "OBEROIRLTY",
  "OFSS", "OIL", "PAGEIND", "PATANJALI", "PAYTM", "PERSISTENT", "PETRONET",
  "PFC", "PHOENIXLTD", "PIDILITIND", "PIIND", "PNB", "POLICYBZR",
  "POLYCAB", "PRESTIGE", "RBLBANK", "RECLTD", "SAIL", "SBICARD",
  "SBILIFE", "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SJVN", "SOLARINDS",
  "SONACOMS", "SRF", "SUPREMEIND", "SYNGENE", "TATACHEM", "TATACOMM",
  "TATACONSUM", "TATAELXSI", "TATAPOWER", "TATATECH", "TECHM", "TIINDIA",
  "TORNTPHARM", "TORNTPOWER", "TRENT", "TVSMOTOR", "UNIONBANK", "UNITDSPR",
  "UPL", "VBL", "VEDL", "VOLTAS", "YESBANK", "ZOMATO", "ZYDUSLIFE",
];

/** Bootstrap seed (Tier B first). Replaced at runtime by Firestore sync when available. */
export const FNO_UNIVERSE: readonly string[] = Array.from(
  new Set<string>([...TIER_B, ...TIER_C]),
);

/** Same symbols, A–Z — use for UI lists only; cron keeps tier priority via ordered universe. */
export const FNO_UNIVERSE_ALPHA: readonly string[] = [...FNO_UNIVERSE].sort((a, b) =>
  a.localeCompare(b, "en", { sensitivity: "base" }),
);

const TIER_B_SET = new Set<string>(TIER_B);

export type FnoTier = "B" | "C";

/** Tier lookup for a symbol (defaults to C). */
export function tierOf(symbol: string): FnoTier {
  return TIER_B_SET.has(symbol) ? "B" : "C";
}

/** Tier B first, then alphabetical — stable queue priority for any symbol list. */
export function orderFnoSymbols(symbols: Iterable<string>): string[] {
  const uniq = new Set<string>();
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase();
    if (sym) uniq.add(sym);
  }
  const tierB = TIER_B.filter((s) => uniq.has(s));
  const rest = [...uniq]
    .filter((s) => !TIER_B_SET.has(s))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return [...tierB, ...rest];
}

/**
 * Select the next batch of symbols starting at `cursor`, wrapping around the
 * universe. Returns the slice and the next cursor to persist. Because Tier B is
 * at the front, a full wrap always refreshes the hot names first.
 */
export function nextBatch(
  universe: readonly string[],
  cursor: number,
  size: number,
): { symbols: string[]; nextCursor: number } {
  const n = universe.length;
  if (n === 0 || size <= 0) return { symbols: [], nextCursor: 0 };
  const start = ((cursor % n) + n) % n;
  const symbols: string[] = [];
  for (let i = 0; i < Math.min(size, n); i++) {
    symbols.push(universe[(start + i) % n]!);
  }
  return { symbols, nextCursor: (start + symbols.length) % n };
}

export type StockAggregateMeta = { computedAt: string | null };

function computedAtMs(meta: StockAggregateMeta | undefined): number {
  if (!meta?.computedAt) return 0;
  const t = Date.parse(meta.computedAt);
  return Number.isFinite(t) ? t : 0;
}

/** Oldest `computedAt` first; ties keep tier order from `universe`. */
export function buildRefreshQueue(
  universe: readonly string[],
  aggregateBySymbol: ReadonlyMap<string, StockAggregateMeta>,
): string[] {
  return [...universe].sort((a, b) => {
    const diff = computedAtMs(aggregateBySymbol.get(a)) - computedAtMs(aggregateBySymbol.get(b));
    if (diff !== 0) return diff;
    return universe.indexOf(a) - universe.indexOf(b);
  });
}

/**
 * Planned dequeue for stock-zone cron — NOT random.
 *
 * 1. Ordered universe (Tier B liquid names first).
 * 2. Firestore cursor: `config/stock_zones_cursor.index`.
 * 3. Firestore aggregate: `config/zone_status_stocks.entries` keys = already "scanned" on UI.
 *
 * Backlog: symbols missing from the aggregate (tier order preserved).
 * Refresh (all scanned): symbols sorted by oldest `computedAt` first (stalest refresh).
 */
export function nextStockZonesBatch(
  universe: readonly string[],
  cursor: number,
  size: number,
  scannedSymbols: ReadonlySet<string>,
  aggregateBySymbol: ReadonlyMap<string, StockAggregateMeta>,
): { symbols: string[]; nextCursor: number; mode: "backlog" | "refresh"; queueLength: number } {
  if (size <= 0) {
    return { symbols: [], nextCursor: cursor, mode: "refresh", queueLength: 0 };
  }

  const backlog = universe.filter((s) => !scannedSymbols.has(s));
  if (backlog.length > 0) {
    const n = backlog.length;
    const start = ((cursor % n) + n) % n;
    const symbols: string[] = [];
    for (let i = 0; i < Math.min(size, n); i++) {
      symbols.push(backlog[(start + i) % n]!);
    }
    return {
      symbols,
      nextCursor: (start + symbols.length) % n,
      mode: "backlog",
      queueLength: n,
    };
  }

  const refreshQueue = buildRefreshQueue(universe, aggregateBySymbol);
  const n = refreshQueue.length;
  if (n === 0) return { symbols: [], nextCursor: cursor, mode: "refresh", queueLength: 0 };

  const start = ((cursor % n) + n) % n;
  const symbols: string[] = [];
  for (let i = 0; i < Math.min(size, n); i++) {
    symbols.push(refreshQueue[(start + i) % n]!);
  }
  return {
    symbols,
    nextCursor: (start + symbols.length) % n,
    mode: "refresh",
    queueLength: n,
  };
}
