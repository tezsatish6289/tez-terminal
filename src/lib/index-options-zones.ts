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
  ivScaledHalfWidth,
  termStructureRatio,
  type VolRegime,
} from "@/lib/zones/vol-regime";
import { filterActiveNseExpiries } from "@/lib/nse/expiry-dates";

/** Per-strike OI + IV for the index zone math (IV optional). */
interface IndexStrikeData {
  callOI: number;
  putOI: number;
  /** Change in OI vs previous close (NSE "Chng in OI"). */
  callOIChange: number;
  putOIChange: number;
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

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read a 2nd expiry for term structure. ON by default; disable with INDEX_TERM_STRUCTURE=0. */
const INDEX_TERM_STRUCTURE_ENABLED = () => envBool("INDEX_TERM_STRUCTURE", true);

/** IV-scale the band off ATM IV. Disable with INDEX_IV_SIZING=0 for fixed points. */
const INDEX_IV_SIZING_ENABLED = () => envBool("INDEX_IV_SIZING", true);
/** σ horizon (days). ~1d reproduces the listed point bands at ~15% VIX. */
const INDEX_IV_HORIZON_DAYS = () => envNum("INDEX_ZONE_IV_HORIZON_DAYS", 1);
/** Floor / cap on the band as a fraction of spot. */
const INDEX_HALF_WIDTH_MIN_PCT = () => envNum("INDEX_ZONE_HALF_WIDTH_MIN_PCT", 0.004);
const INDEX_HALF_WIDTH_MAX_PCT = () => envNum("INDEX_ZONE_HALF_WIDTH_MAX_PCT", 0.02);

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

/**
 * How many nearest expiries to derive full S/R bands for. Drives both the chart
 * expiry picker and the Nifty Outlook forward map (today → ~4 expiries out).
 */
const INDEX_EXPIRY_SLICE_COUNT = () => envNum("INDEX_EXPIRY_SLICE_COUNT", 4);

export interface IndexZonesComputeResult {
  /** Nearest expiry — persisted as top-level doc fields for backward compat. */
  primary: IndexOptionsZones;
  /** Nearest-first full zone rows (length ≤ INDEX_EXPIRY_SLICE_COUNT). */
  byExpiry: IndexOptionsZones[];
}

export interface IndexOptionsZones {
  symbol:        IndexKey;
  label:         string;

  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bullOI:        number | null;
  /** Change in put OI at the support cluster vs prev close (+ = reinforcing). */
  bullOIChange:  number | null;

  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null;
  bearOI:        number | null;
  /** Change in call OI at the resistance cluster vs prev close (+ = reinforcing). */
  bearOIChange:  number | null;

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
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null, bullOI: null, bullOIChange: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null, bearOI: null, bearOIChange: null,
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
  CE?: { openInterest: number; changeinOpenInterest?: number; impliedVolatility?: number };
  PE?: { openInterest: number; changeinOpenInterest?: number; impliedVolatility?: number };
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
  const active = filterActiveNseExpiries(list);
  if (!active.length) {
    throw new Error(`NSE contract-info returned no active (non-expired) expiries for ${symbol}`);
  }
  return active;
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
    const s = strikes.get(row.strikePrice) ?? { callOI: 0, putOI: 0, callOIChange: 0, putOIChange: 0 };
    s.callOI += callOI;
    s.putOI += putOI;
    s.callOIChange += row.CE?.changeinOpenInterest ?? 0;
    s.putOIChange += row.PE?.changeinOpenInterest ?? 0;
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

function buildZonesFromRows(
  key: IndexKey,
  spot: number,
  strikes: Map<number, IndexStrikeData>,
  totalOI: number,
  expiryUsed: string,
  regimeInputs: IndexRegimeInputs,
  nextAtmIv: number | null = null,
): IndexOptionsZones {
  const spec = INDEX_SPECS[key];
  const empty = (): IndexOptionsZones => ({
    ...createEmptyIndexZones(key, spot),
    expiryUsed,
  });

  if (!strikes.size) return empty();

  let bullStrike: number | null = null;
  let bullOI = 0;
  let bullOIChange = 0;
  let bearStrike: number | null = null;
  let bearOI = 0;
  let bearOIChange = 0;
  for (const [strike, { putOI, callOI, putOIChange, callOIChange }] of strikes) {
    if (strike < spot && putOI > bullOI) {
      bullOI = putOI;
      bullOIChange = putOIChange;
      bullStrike = strike;
    }
    if (strike > spot && callOI > bearOI) {
      bearOI = callOI;
      bearOIChange = callOIChange;
      bearStrike = strike;
    }
  }

  const maxPain = computeMaxPain(strikes);
  const gap = bullStrike !== null && bearStrike !== null ? bearStrike - bullStrike : 0;
  const insufficientGap = gap > 0 && gap < spec.minStrikeGap;
  const atmIV = computeAtmIv(strikes, spot);

  const halfWidth = INDEX_IV_SIZING_ENABLED()
    ? ivScaledHalfWidth(spot, atmIV, {
        horizonDays: INDEX_IV_HORIZON_DAYS(),
        minPct: INDEX_HALF_WIDTH_MIN_PCT(),
        maxPct: INDEX_HALF_WIDTH_MAX_PCT(),
        fallbackAbs: spec.zoneHalfWidthPts,
        strikeStep: spec.strikeStep,
      })
    : ivScaledHalfWidth(spot, null, {
        fallbackAbs: spec.zoneHalfWidthPts,
        strikeStep: spec.strikeStep,
      });

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
    bullZoneLow: bullStrike !== null ? bullStrike - halfWidth : null,
    bullZoneHigh: bullStrike !== null ? bullStrike + halfWidth : null,
    bullExitAbove: bullStrike !== null ? bullStrike + halfWidth : null,
    bullOI: bullOI > 0 ? bullOI : null,
    bullOIChange: bullStrike !== null ? bullOIChange : null,

    bearStrike,
    bearZoneLow: bearStrike !== null ? bearStrike - halfWidth : null,
    bearZoneHigh: bearStrike !== null ? bearStrike + halfWidth : null,
    bearExitBelow: bearStrike !== null ? bearStrike - halfWidth : null,
    bearOI: bearOI > 0 ? bearOI : null,
    bearOIChange: bearStrike !== null ? bearOIChange : null,

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

async function computeIndexZonesForExpiry(
  key: IndexKey,
  expiry: string,
  cookies: string,
  spotHint: number,
  regimeInputs: IndexRegimeInputs,
): Promise<IndexOptionsZones> {
  const oc = await fetchOptionChain(key, expiry, cookies);
  const spot = oc.records?.underlyingValue ?? spotHint;
  const rows = oc.records?.data ?? [];
  if (spot <= 0 || !rows.length) {
    return { ...createEmptyIndexZones(key, spot), expiryUsed: expiry };
  }
  const { strikes, totalOI } = rowsToStrikes(rows);
  return buildZonesFromRows(key, spot, strikes, totalOI, expiry, regimeInputs);
}

/** Compute bull/bear zones for nearest + next expiries. Throws on NSE fetch failure. */
export async function computeIndexZones(
  key: IndexKey,
  cookies: string,
  regimeInputs: IndexRegimeInputs = {},
): Promise<IndexZonesComputeResult> {
  const expiries = await fetchExpiries(key, cookies);
  const count = Math.min(INDEX_EXPIRY_SLICE_COUNT(), expiries.length);
  const byExpiry: IndexOptionsZones[] = [];
  let spot = 0;

  for (let i = 0; i < count; i++) {
    const z = await computeIndexZonesForExpiry(key, expiries[i]!, cookies, spot, regimeInputs);
    byExpiry.push(z);
    if (z.spot > 0) spot = z.spot;
  }

  const primary = byExpiry[0] ?? createEmptyIndexZones(key);
  if (byExpiry.length > 1 && primary.expiryUsed) {
    const nextAtmIv =
      regimeInputs.nextAtmIv ??
      (INDEX_TERM_STRUCTURE_ENABLED() ? byExpiry[1]?.atmIV ?? null : null);
    if (nextAtmIv != null && primary.atmIV != null) {
      primary.volRegime = classifyVolRegime({
        atmIv: primary.atmIV,
        illiquid: (primary.expiryOI ?? 0) < MIN_OI_THRESHOLD,
        ivPercentile: ivPercentile(regimeInputs.ivHistory ?? [], primary.atmIV),
        termRatio: termStructureRatio(primary.atmIV, nextAtmIv),
        vixPercentile: regimeInputs.vixPercentile,
      });
    }
  }

  return { primary, byExpiry };
}

/** Re-export so callers don't need to import nse-session directly. */
export { getNseCookies };
