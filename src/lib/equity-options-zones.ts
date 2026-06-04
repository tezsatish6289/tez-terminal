/**
 * NSE single-stock (equity) option-chain zone engine.
 *
 * Mirrors the proven index logic (`index-options-zones.ts`) but for the F&O
 * equity segment, with two stock-specific differences:
 *   1. `type=Equities` (not `Indices`) on `option-chain-v3`.
 *   2. **Dynamic band width** — a fixed point half-width is meaningless across a
 *      ₹150 stock and a ₹3,000 stock, so the half-width is a % of spot, snapped
 *      to the chain's own strike grid for clean numbers.
 *
 * It performs NO NSE I/O itself — it receives a pre-bootstrapped `NseSession`
 * (rate-limited + circuit-broken) and reuses it. This keeps every NSE call on
 * the safe shared client and the cookie handshake amortised across the batch.
 */

import type { NseSession } from "@/lib/nse/client";
import { deriveZoneStatus, type ZoneStatus } from "@/lib/zones/zone-status";

const NSE_OC_V3 = "https://www.nseindia.com/api/option-chain-v3";
const NSE_CONTRACT_INFO = "https://www.nseindia.com/api/option-chain-contract-info";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Half-width as a fraction of spot (default 0.75%). */
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
  spot: number;
  computedAt: string;
}

interface NseOptionEntry {
  strikePrice?: number;
  CE?: { openInterest?: number };
  PE?: { openInterest?: number };
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
  strikes: Map<number, { callOI: number; putOI: number }>,
  expiryUsed: string | null,
): EquityOptionsZones {
  if (spot <= 0 || !strikes.size) return emptyResult(symbol, spot, expiryUsed);

  let totalOI = 0;
  for (const { callOI, putOI } of strikes.values()) totalOI += callOI + putOI;

  const strikeStep = inferStrikeStep([...strikes.keys()]);

  let halfWidth = spot * HALF_WIDTH_PCT();
  if (strikeStep) halfWidth = Math.max(halfWidth, strikeStep);
  halfWidth = Math.round(halfWidth * 100) / 100;

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
    spot,
    computedAt: new Date().toISOString(),
  };
}

function computeMaxPain(
  strikes: Map<number, { callOI: number; putOI: number }>,
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
export async function computeEquityZones(
  symbol: string,
  session: NseSession,
): Promise<EquityOptionsZones> {
  const expiries = await fetchExpiries(symbol, session);
  const expiryUsed = expiries[0];
  const oc = await fetchOptionChain(symbol, expiryUsed, session);

  const spot = oc.records?.underlyingValue ?? 0;
  const rows = oc.records?.data ?? [];
  if (spot <= 0 || !rows.length) return emptyResult(symbol, spot, expiryUsed);

  const strikes = new Map<number, { callOI: number; putOI: number }>();
  for (const row of rows) {
    if (row.strikePrice == null) continue;
    const callOI = row.CE?.openInterest ?? 0;
    const putOI = row.PE?.openInterest ?? 0;
    if (callOI === 0 && putOI === 0) continue;
    const s = strikes.get(row.strikePrice) ?? { callOI: 0, putOI: 0 };
    s.callOI += callOI;
    s.putOI += putOI;
    strikes.set(row.strikePrice, s);
  }

  return buildEquityZonesFromStrikes(symbol, spot, strikes, expiryUsed);
}
