import { getNseCookies, API_HEADERS } from "@/lib/nse-session";
import { nseFetch } from "@/lib/nse-fetch";
import {
  INDEX_KEYS,
  INDEX_SPECS,
  type IndexKey,
  type IndexSpec,
} from "@/lib/index-specs";
import {
  classifyVolRegime,
  computeAtmIv,
  ivPercentile,
  termStructureRatio,
  type VolRegime,
} from "@/lib/zones/vol-regime";

/** Per-strike OI + IV for the index zone math (IV optional). */
interface IndexStrikeData {
  callOI: number;
  putOI: number;
  callIV?: number | null;
  putIV?: number | null;
}

/** Optional volatility-regime inputs threaded in by the caller. */
export interface IndexRegimeInputs {
  ivHistory?: number[];
  nextAtmIv?: number | null;
  vixPercentile?: number | null;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Read a 2nd expiry for term structure. OFF by default (doubles NSE calls). */
const INDEX_TERM_STRUCTURE_ENABLED = () => envBool("INDEX_TERM_STRUCTURE", false);

export type { IndexKey, IndexSpec };
export { INDEX_KEYS, INDEX_SPECS };

/**
 * Multi-index NSE option-chain zone suggester.
 *
 * Generalises the single-symbol NIFTY logic (`nifty-options-zones.ts`) to
 * all five indices listed on https://www.nseindia.com/option-chain:
 *   NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50.
 *
 * Key differences from the legacy NIFTY-only path:
 *   1. Expiry is resolved from NSE's `option-chain-contract-info` endpoint
 *      (nearest first), NOT a "next Tuesday" weekday guess. NIFTY is weekly;
 *      the other four are monthly only (NSE retired their weeklies), so the
 *      nearest valid expiry can be ~4 weeks out — a fixed 14-day window would
 *      drop them entirely.
 *   2. `option-chain-v3` returns a single expiry's chain, so there is no
 *      multi-expiry windowing — we aggregate every row in the response.
 *   3. Per-index strike grid / gap / zone half-width (see INDEX_SPECS).
 *
 * Logic per index:
 *   • spot      → embedded `records.underlyingValue`.
 *   • bull zone → dominant PUT strike below spot (highest put OI) ± halfWidth.
 *   • bear zone → dominant CALL strike above spot (highest call OI) ± halfWidth.
 *   • max pain  → strike minimising total option-writer payout.
 *   • gap check → bearStrike − bullStrike must clear the per-index minimum.
 */

const NSE_OC_V3 = "https://www.nseindia.com/api/option-chain-v3";
const NSE_CONTRACT_INFO = "https://www.nseindia.com/api/option-chain-contract-info";

/** Minimum total OI (contracts) for the chosen expiry to be considered liquid. */
const MIN_OI_THRESHOLD = 20_000;

export interface IndexOptionsZones {
  symbol:        IndexKey;
  label:         string;

  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bullOI:        number | null;

  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null;
  bearOI:        number | null;

  maxPain:         number | null;
  expiryUsed:      string | null;
  expiryOI:        number | null;
  halfWidthPts:    number;
  insufficientGap: boolean;
  atmIV:           number | null;
  volRegime:       VolRegime;
  spot:            number;
  computedAt:      string;
}

export function createEmptyIndexZones(key: IndexKey, spot = 0): IndexOptionsZones {
  const spec = INDEX_SPECS[key];
  return {
    symbol: key,
    label: spec.label,
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null, bullOI: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null, bearOI: null,
    maxPain: null, expiryUsed: null, expiryOI: null,
    halfWidthPts: spec.zoneHalfWidthPts,
    insufficientGap: false,
    atmIV: null,
    volRegime: classifyVolRegime({ atmIv: null, illiquid: true }),
    spot: spot > 0 ? spot : 0,
    computedAt: new Date().toISOString(),
  };
}

// ── NSE fetch ─────────────────────────────────────────────────────

interface NseOptionEntry {
  strikePrice: number;
  expiryDates?: string;
  expiryDate?: string;
  CE?: { openInterest: number; impliedVolatility?: number };
  PE?: { openInterest: number; impliedVolatility?: number };
}

interface NseOcResponse {
  records?: {
    data?:            NseOptionEntry[];
    expiryDates?:     string[];
    underlyingValue?: number;
  };
}

interface NseContractInfoResponse {
  expiryDates?: string[];
  records?: { expiryDates?: string[] };
}

/** Pull the chronological expiry list (nearest first) for a symbol. */
async function fetchExpiries(symbol: IndexKey, cookies: string): Promise<string[]> {
  const url = `${NSE_CONTRACT_INFO}?symbol=${encodeURIComponent(symbol)}`;
  const res = await nseFetch(url, {
    headers: { ...API_HEADERS, Cookie: cookies },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NSE contract-info HTTP ${res.status} for ${symbol}`);
  const text = (await res.text()).trim();
  if (!text || text === "{}") {
    throw new Error(`NSE contract-info empty for ${symbol} (session rejected or geo-blocked)`);
  }
  let json: NseContractInfoResponse;
  try {
    json = JSON.parse(text) as NseContractInfoResponse;
  } catch {
    throw new Error(`NSE contract-info non-JSON for ${symbol} (likely bot-blocked)`);
  }
  const list = json.expiryDates ?? json.records?.expiryDates ?? [];
  if (!list.length) throw new Error(`NSE contract-info returned no expiries for ${symbol}`);
  return list;
}

async function fetchOptionChain(
  symbol: IndexKey,
  expiry: string,
  cookies: string,
): Promise<NseOcResponse> {
  const u = new URL(NSE_OC_V3);
  u.searchParams.set("type", "Indices");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("expiry", expiry);

  const res = await nseFetch(u.toString(), {
    headers: { ...API_HEADERS, Cookie: cookies },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`NSE option chain HTTP ${res.status} for ${symbol} ${expiry}`);
  const text = (await res.text()).trim();
  if (!text || text === "{}") {
    throw new Error(`NSE option chain empty for ${symbol} ${expiry} (session rejected or geo-blocked)`);
  }
  try {
    return JSON.parse(text) as NseOcResponse;
  } catch {
    throw new Error(`NSE option chain non-JSON for ${symbol} (likely bot-blocked)`);
  }
}

// ── Math helpers ──────────────────────────────────────────────────

/** Aggregate an option-chain response's rows into a strike → OI/IV map. */
function rowsToStrikes(rows: NseOptionEntry[]): { strikes: Map<number, IndexStrikeData>; totalOI: number } {
  const strikes = new Map<number, IndexStrikeData>();
  let totalOI = 0;
  for (const row of rows) {
    if (row.strikePrice == null) continue;
    const callOI = row.CE?.openInterest ?? 0;
    const putOI = row.PE?.openInterest ?? 0;
    if (callOI === 0 && putOI === 0) continue;
    totalOI += callOI + putOI;
    const s = strikes.get(row.strikePrice) ?? { callOI: 0, putOI: 0 };
    s.callOI += callOI;
    s.putOI += putOI;
    if (typeof row.CE?.impliedVolatility === "number") s.callIV = row.CE.impliedVolatility;
    if (typeof row.PE?.impliedVolatility === "number") s.putIV = row.PE.impliedVolatility;
    strikes.set(row.strikePrice, s);
  }
  return { strikes, totalOI };
}

function computeMaxPain(
  strikes: Map<number, IndexStrikeData>,
): number | null {
  const list = [...strikes.keys()].sort((a, b) => a - b);
  if (!list.length) return null;
  let best = list[0];
  let minPayout = Infinity;
  for (const s of list) {
    let p = 0;
    for (const [k, { callOI, putOI }] of strikes) {
      if (s > k) p += (s - k) * callOI;
      if (s < k) p += (k - s) * putOI;
    }
    if (p < minPayout) { minPayout = p; best = s; }
  }
  return best;
}

// ── Public API ────────────────────────────────────────────────────

/** Compute bull/bear zones for one index. Throws on NSE fetch failure. */
export async function computeIndexZones(
  key: IndexKey,
  cookies: string,
  regimeInputs: IndexRegimeInputs = {},
): Promise<IndexOptionsZones> {
  const spec = INDEX_SPECS[key];
  const halfWidth = spec.zoneHalfWidthPts;

  const expiries = await fetchExpiries(key, cookies);
  const expiryUsed = expiries[0];
  const oc = await fetchOptionChain(key, expiryUsed, cookies);

  const spot = oc.records?.underlyingValue ?? 0;
  const empty = (): IndexOptionsZones => ({
    ...createEmptyIndexZones(key, spot),
    expiryUsed,
  });

  const rows = oc.records?.data ?? [];
  if (spot <= 0 || !rows.length) return empty();

  // v3 returns a single expiry's chain — aggregate every row by strike.
  const { strikes, totalOI } = rowsToStrikes(rows);

  if (!strikes.size) return empty();

  let bullStrike: number | null = null; let bullOI = 0;
  let bearStrike: number | null = null; let bearOI = 0;
  for (const [strike, { putOI, callOI }] of strikes) {
    if (strike < spot && putOI > bullOI) { bullOI = putOI; bullStrike = strike; }
    if (strike > spot && callOI > bearOI) { bearOI = callOI; bearStrike = strike; }
  }

  const maxPain = computeMaxPain(strikes);
  const gap = bullStrike !== null && bearStrike !== null ? bearStrike - bullStrike : 0;
  const insufficientGap = gap > 0 && gap < spec.minStrikeGap;

  // Optional term structure: read the next expiry's ATM IV (env-gated).
  let nextAtmIv = regimeInputs.nextAtmIv ?? null;
  if (nextAtmIv == null && INDEX_TERM_STRUCTURE_ENABLED() && expiries[1]) {
    try {
      const ocNext = await fetchOptionChain(key, expiries[1], cookies);
      nextAtmIv = computeAtmIv(rowsToStrikes(ocNext.records?.data ?? []).strikes, spot);
    } catch {
      /* term structure stays unknown */
    }
  }

  const atmIV = computeAtmIv(strikes, spot);
  const illiquid = totalOI < MIN_OI_THRESHOLD;
  const volRegime = classifyVolRegime({
    atmIv: atmIV,
    illiquid,
    ivPercentile: ivPercentile(regimeInputs.ivHistory ?? [], atmIV),
    termRatio: termStructureRatio(atmIV, nextAtmIv),
    vixPercentile: regimeInputs.vixPercentile,
  });

  return {
    symbol: key,
    label: spec.label,
    bullStrike,
    bullZoneLow:   bullStrike !== null ? bullStrike - halfWidth : null,
    bullZoneHigh:  bullStrike !== null ? bullStrike + halfWidth : null,
    bullExitAbove: bullStrike !== null ? bullStrike + halfWidth : null,
    bullOI: bullOI > 0 ? bullOI : null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - halfWidth : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + halfWidth : null,
    bearExitBelow: bearStrike !== null ? bearStrike - halfWidth : null,
    bearOI: bearOI > 0 ? bearOI : null,

    maxPain,
    expiryUsed,
    expiryOI: totalOI >= MIN_OI_THRESHOLD ? totalOI : totalOI > 0 ? totalOI : null,
    halfWidthPts: halfWidth,
    insufficientGap,
    atmIV,
    volRegime,
    spot,
    computedAt: new Date().toISOString(),
  };
}

/** Re-export so callers don't need to import nse-session directly. */
export { getNseCookies };
