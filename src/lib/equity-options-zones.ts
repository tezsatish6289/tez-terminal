/**
 * NSE single-stock (equity) option-chain zone engine.
 *
 * Mirrors the proven index logic (`index-options-zones.ts`) but for the F&O
 * equity segment, with two stock-specific differences:
 *   1. `type=Equities` (not `Indices`) on `option-chain-v3`.
 *   2. **Dynamic band width** — a fixed point half-width is meaningless across a
 *      ₹150 stock and a ₹3,000 stock, so the half-width is IV-scaled (a 1-σ move
 *      off ATM IV, floored/capped as a % of spot and snapped to the strike grid),
 *      falling back to a flat % of spot when ATM IV is unknown.
 *
 * It performs NO NSE I/O itself — it receives a pre-bootstrapped `NseSession`
 * (rate-limited + circuit-broken) and reuses it. This keeps every NSE call on
 * the safe shared client and the cookie handshake amortised across the batch.
 */

import type { NseSession } from "@/lib/nse/client";
import { deriveZoneStatus, type ZoneStatus } from "@/lib/zones/zone-status";
import {
  classifyVolRegime,
  computeAtmIv,
  crossSectionalPercentile,
  ivPercentile,
  ivScaledHalfWidth,
  termStructureRatio,
  type VolRegime,
} from "@/lib/zones/vol-regime";

/** Per-strike OI + IV used by the zone builder (IV optional — last-good safe). */
export interface EquityStrikeData {
  callOI: number;
  putOI: number;
  callIV?: number | null;
  putIV?: number | null;
}

/**
 * Optional volatility-regime inputs threaded in by the caller. All optional so
 * the engine degrades gracefully: earnings + ATM IV work day 1; percentile,
 * term structure and VIX sharpen the read as history / extra fetches land.
 */
export interface EquityRegimeInputs {
  daysToEarnings?: number | null;
  /** This name's past daily ATM IVs → self percentile (preferred). */
  ivHistory?: number[];
  /** Peer ATM IVs today → cross-sectional percentile (cold-start fallback). */
  crossSectionalIvs?: number[];
  /** Next-expiry ATM IV → term-structure ratio (when fetched). */
  nextAtmIv?: number | null;
  /** India VIX percentile (market-wide backdrop). */
  vixPercentile?: number | null;
  /** Explicit overrides (rare — tests / precomputed). */
  ivPercentile?: number | null;
  termRatio?: number | null;
}

const NSE_OC_V3 = "https://www.nseindia.com/api/option-chain-v3";
const NSE_CONTRACT_INFO = "https://www.nseindia.com/api/option-chain-contract-info";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Fetch a 2nd expiry to read term structure (near vs next ATM IV). ON by
 * default. It doubles NSE option-chain calls per symbol (the fetch is
 * best-effort, so a rate-limited call just leaves term structure unknown).
 * Disable with `EQUITY_TERM_STRUCTURE=0` if the NSE rate budget gets tight.
 */
export const TERM_STRUCTURE_ENABLED = () => envBool("EQUITY_TERM_STRUCTURE", true);

/** IV-scale the band off ATM IV. Disable with EQUITY_IV_SIZING=0 for flat %. */
const IV_SIZING_ENABLED = () => envBool("EQUITY_IV_SIZING", true);
/** σ horizon (days). ~0.33d reproduces the old 0.75% band at ~25% IV. */
const IV_HORIZON_DAYS = () => envNum("STOCK_ZONE_IV_HORIZON_DAYS", 0.33);
/** Floor / cap on the band as a fraction of spot. */
const HALF_WIDTH_MIN_PCT = () => envNum("STOCK_ZONE_HALF_WIDTH_MIN_PCT", 0.004);
const HALF_WIDTH_MAX_PCT = () => envNum("STOCK_ZONE_HALF_WIDTH_MAX_PCT", 0.02);
/** Flat half-width as a fraction of spot — fallback when ATM IV is unknown. */
const HALF_WIDTH_PCT = () => envNum("STOCK_ZONE_HALF_WIDTH_PCT", 0.0075);
/** Minimum bear−bull strike gap as a fraction of spot (default 2%). */
const MIN_GAP_PCT = () => envNum("STOCK_ZONE_MIN_GAP_PCT", 0.02);
/** Minimum total OI (contracts) for the chosen expiry to be considered liquid. */
const MIN_OI = () => envNum("STOCK_ZONE_MIN_OI", 1_000);

export interface EquityOptionsZones {
  symbol: string;
  label: string;

  bullStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bullExitAbove: number | null;
  bullOI: number | null;

  bearStrike: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  bearExitBelow: number | null;
  bearOI: number | null;

  maxPain: number | null;
  expiryUsed: string | null;
  expiryOI: number | null;
  halfWidth: number;
  strikeStep: number | null;
  insufficientGap: boolean;
  illiquid: boolean;
  status: ZoneStatus;
  /** ATM implied vol (percent points) for this chain, null when unavailable. */
  atmIV: number | null;
  /** Volatility-regime qualifier (earnings/elevated/calm) — display only. */
  volRegime: VolRegime;
  spot: number;
  computedAt: string;
}

interface NseOptionEntry {
  strikePrice?: number;
  CE?: { openInterest?: number; impliedVolatility?: number };
  PE?: { openInterest?: number; impliedVolatility?: number };
}

interface NseOcResponse {
  records?: {
    data?: NseOptionEntry[];
    expiryDates?: string[];
    underlyingValue?: number;
  };
}

interface NseContractInfoResponse {
  expiryDates?: string[];
  records?: { expiryDates?: string[] };
}

function emptyResult(symbol: string, spot = 0, expiryUsed: string | null = null): EquityOptionsZones {
  return {
    symbol,
    label: symbol,
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null, bullOI: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null, bearOI: null,
    maxPain: null, expiryUsed, expiryOI: null,
    halfWidth: 0, strikeStep: null,
    insufficientGap: false, illiquid: true, status: "ILLIQUID",
    atmIV: null,
    volRegime: classifyVolRegime({ atmIv: null, illiquid: true }),
    spot: spot > 0 ? spot : 0,
    computedAt: new Date().toISOString(),
  };
}

/** Most common gap between consecutive strikes — the chain's strike step. */
function inferStrikeStep(strikes: number[]): number | null {
  if (strikes.length < 2) return null;
  const sorted = [...strikes].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round((sorted[i] - sorted[i - 1]) * 100) / 100;
    if (gap > 0) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [gap, c] of counts) {
    if (c > bestCount) { bestCount = c; best = gap; }
  }
  return best;
}

export function buildEquityZonesFromStrikes(
  symbol: string,
  spot: number,
  strikes: Map<number, EquityStrikeData>,
  expiryUsed: string | null,
  regimeInputs: EquityRegimeInputs = {},
): EquityOptionsZones {
  if (spot <= 0 || !strikes.size) return emptyResult(symbol, spot, expiryUsed);

  let totalOI = 0;
  for (const { callOI, putOI } of strikes.values()) totalOI += callOI + putOI;

  const strikeStep = inferStrikeStep([...strikes.keys()]);

  // IV-scaled band: 1-σ move sized from ATM IV (falls back to flat % when IV is
  // unknown). Computed before the zones since the band width defines them.
  const atmIV = computeAtmIv(strikes, spot);
  const halfWidth = IV_SIZING_ENABLED()
    ? ivScaledHalfWidth(spot, atmIV, {
        horizonDays: IV_HORIZON_DAYS(),
        minPct: HALF_WIDTH_MIN_PCT(),
        maxPct: HALF_WIDTH_MAX_PCT(),
        fallbackPct: HALF_WIDTH_PCT(),
        strikeStep,
      })
    : ivScaledHalfWidth(spot, null, { fallbackPct: HALF_WIDTH_PCT(), strikeStep });

  let bullStrike: number | null = null;
  let bullOI = 0;
  let bearStrike: number | null = null;
  let bearOI = 0;
  for (const [strike, { putOI, callOI }] of strikes) {
    if (strike < spot && putOI > bullOI) {
      bullOI = putOI;
      bullStrike = strike;
    }
    if (strike > spot && callOI > bearOI) {
      bearOI = callOI;
      bearStrike = strike;
    }
  }

  const maxPain = computeMaxPain(strikes);
  const gap = bullStrike != null && bearStrike != null ? bearStrike - bullStrike : 0;
  const insufficientGap = gap > 0 && gap < spot * MIN_GAP_PCT();
  const illiquid = totalOI < MIN_OI();

  const bullZoneLow = bullStrike != null ? bullStrike - halfWidth : null;
  const bullZoneHigh = bullStrike != null ? bullStrike + halfWidth : null;
  const bearZoneLow = bearStrike != null ? bearStrike - halfWidth : null;
  const bearZoneHigh = bearStrike != null ? bearStrike + halfWidth : null;

  const status = illiquid
    ? "ILLIQUID"
    : deriveZoneStatus({
        spot,
        bullLow: bullZoneLow,
        bullHigh: bullZoneHigh,
        bearLow: bearZoneLow,
        bearHigh: bearZoneHigh,
      });

  const termRatio =
    regimeInputs.termRatio ?? termStructureRatio(atmIV, regimeInputs.nextAtmIv ?? null);
  const ivPct =
    regimeInputs.ivPercentile ??
    ivPercentile(regimeInputs.ivHistory ?? [], atmIV) ??
    crossSectionalPercentile(regimeInputs.crossSectionalIvs ?? [], atmIV);
  const volRegime = classifyVolRegime({
    atmIv: atmIV,
    illiquid,
    daysToEarnings: regimeInputs.daysToEarnings,
    ivPercentile: ivPct,
    termRatio,
    vixPercentile: regimeInputs.vixPercentile,
  });

  return {
    symbol,
    label: symbol,
    bullStrike,
    bullZoneLow,
    bullZoneHigh,
    bullExitAbove: bullZoneHigh,
    bullOI: bullOI > 0 ? bullOI : null,
    bearStrike,
    bearZoneLow,
    bearZoneHigh,
    bearExitBelow: bearZoneLow,
    bearOI: bearOI > 0 ? bearOI : null,
    maxPain,
    expiryUsed,
    expiryOI: totalOI > 0 ? totalOI : null,
    halfWidth,
    strikeStep,
    insufficientGap,
    illiquid,
    status,
    atmIV,
    volRegime,
    spot,
    computedAt: new Date().toISOString(),
  };
}

function computeMaxPain(
  strikes: Map<number, EquityStrikeData>,
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

async function fetchExpiries(symbol: string, session: NseSession): Promise<string[]> {
  const url = `${NSE_CONTRACT_INFO}?symbol=${encodeURIComponent(symbol)}`;
  const json = await session.fetchJson<NseContractInfoResponse>(url);
  const list = json.expiryDates ?? json.records?.expiryDates ?? [];
  if (!list.length) throw new Error(`No expiries for ${symbol}`);
  return list;
}

async function fetchOptionChain(
  symbol: string,
  expiry: string,
  session: NseSession,
): Promise<NseOcResponse> {
  const u = new URL(NSE_OC_V3);
  u.searchParams.set("type", "Equities");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("expiry", expiry);
  return session.fetchJson<NseOcResponse>(u.toString());
}

/**
 * Compute bull/bear zones for one F&O stock using a reused NSE session.
 * Throws (via the session) on a block; returns an `illiquid` result for thin
 * or empty chains rather than throwing, so the batch keeps going.
 */
/** Aggregate an option-chain response's rows into a strike → OI/IV map. */
function rowsToStrikes(rows: NseOptionEntry[]): Map<number, EquityStrikeData> {
  const strikes = new Map<number, EquityStrikeData>();
  for (const row of rows) {
    if (row.strikePrice == null) continue;
    const callOI = row.CE?.openInterest ?? 0;
    const putOI = row.PE?.openInterest ?? 0;
    if (callOI === 0 && putOI === 0) continue;
    const s = strikes.get(row.strikePrice) ?? { callOI: 0, putOI: 0 };
    s.callOI += callOI;
    s.putOI += putOI;
    if (typeof row.CE?.impliedVolatility === "number") s.callIV = row.CE.impliedVolatility;
    if (typeof row.PE?.impliedVolatility === "number") s.putIV = row.PE.impliedVolatility;
    strikes.set(row.strikePrice, s);
  }
  return strikes;
}

export async function computeEquityZones(
  symbol: string,
  session: NseSession,
  regimeInputs: EquityRegimeInputs = {},
): Promise<EquityOptionsZones> {
  const expiries = await fetchExpiries(symbol, session);
  const expiryUsed = expiries[0];
  const oc = await fetchOptionChain(symbol, expiryUsed, session);

  const spot = oc.records?.underlyingValue ?? 0;
  const rows = oc.records?.data ?? [];
  if (spot <= 0 || !rows.length) return emptyResult(symbol, spot, expiryUsed);

  const strikes = rowsToStrikes(rows);

  // Optional term structure: read the next expiry's ATM IV (env-gated — extra
  // NSE call). Best-effort: a failure just leaves term structure unknown.
  let nextAtmIv = regimeInputs.nextAtmIv ?? null;
  if (nextAtmIv == null && TERM_STRUCTURE_ENABLED() && expiries[1]) {
    try {
      const ocNext = await fetchOptionChain(symbol, expiries[1], session);
      const nextStrikes = rowsToStrikes(ocNext.records?.data ?? []);
      nextAtmIv = computeAtmIv(nextStrikes, spot);
    } catch {
      /* term structure stays unknown */
    }
  }

  return buildEquityZonesFromStrikes(symbol, spot, strikes, expiryUsed, {
    ...regimeInputs,
    nextAtmIv,
  });
}
