/**
 * Deribit-based zone suggester — Market Maker Urgency model.
 *
 * Core insight: market makers who sold options actively hedge by trading BTC
 * spot toward their max pain strike. The zone where a MM has the most urgent
 * need to defend is the strongest support/resistance level in the market.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Algorithm
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Fetch all BTC options from Deribit (free public API).
 * 2. Find the next 3 un-expired daily expiries relative to Date.now().
 *    - Deribit daily options expire at 08:00 UTC (1:30 PM IST).
 *    - After today's expiry passes, "tomorrow" automatically becomes day0.
 *    - Expiry weights: day0 = 3.0  ·  day1 = 1.5  ·  day2 = 1.0
 *
 * 3. Compute urgency score for every strike across all 3 expiries:
 *      weighted_OI(s)  = Σ  rawOI(s, dayI) × expiryWeight[i]
 *      urgency(s)      = weighted_OI(s) / (distance_pct_from_spot + 0.005)
 *    Proximity amplifier rewards near-ATM clusters; 0.005 prevents infinity
 *    at strikes exactly at spot. Strikes > 8% away are excluded (unreachable).
 *
 * 4. Select zones:
 *    - Bull zone = put  strike BELOW spot with highest urgency score
 *    - Bear zone = call strike ABOVE spot with highest urgency score
 *
 * 5. Compute max pain separately for each of the 3 expiries.
 *    Max pain = price where total option payout to holders is minimised
 *    (i.e. where MMs lose the least — their preferred destination).
 *
 * 6. TP target per zone: find the nearest max pain (from any of the 3 expiries)
 *    in the correct direction (above zone-high for bull, below zone-low for bear)
 *    with at least MIN_TP_USD ($1,000) of room.
 *    - Confidence: day0 max pain = HIGH · day1 = MEDIUM · day2 = LOW
 *    - If NO valid TP exists → zone is rejected (null).
 *
 * 7. Gap check: bearStrike − bullStrike must be ≥ MIN_STRIKE_GAP ($2,500).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Date context: always dynamic from Date.now() — never hardcoded.
 * ──────────────────────────────────────────────────────────────────────────
 */

const DERIBIT_API = "https://www.deribit.com/api/v2/public";

export const DEFAULT_ZONE_HALF_WIDTH_USD = 500;
const MIN_ZONE_HALF_WIDTH_USD = 50;
const MAX_ZONE_HALF_WIDTH_USD = 3000;

const DAYS_TO_SCAN     = 3;                 // always look at the next 3 un-expired expiries
const MAX_DAYS_WINDOW  = 7;                 // ignore expiries > 7 days out
const EXPIRY_WEIGHTS   = [3.0, 1.5, 1.0];  // day0, day1, day2 — recency urgency multipliers
const PROXIMITY_BUFFER = 0.005;             // 0.5% — prevents division by zero at ATM
const MAX_REACH_PCT    = 0.08;              // 8% max distance from spot; beyond is unreachable
const MIN_TP_USD       = 500;              // minimum TP room in USD (zone edge → max pain); reduced from 1000
const MIN_STRIKE_GAP   = 2500;             // bearStrike − bullStrike must be ≥ $2,500

// ── Types ──────────────────────────────────────────────────────────────────

export interface MaxPainEntry {
  expiry:   string;   // e.g. "8MAY26"
  maxPain:  number;
  totalOI:  number;   // total contracts in this expiry
  dayIndex: number;   // 0 = nearest un-expired
}

export interface OptionsZones {
  // ── Zone bands ──────────────────────────────────────────────────────────
  bullStrike:    number | null;
  bullZoneLow:   number | null;  // bullStrike − halfWidth
  bullZoneHigh:  number | null;  // bullStrike + halfWidth
  bullExitAbove: number | null;  // same as bullZoneHigh (strict zone exit)

  bearStrike:    number | null;
  bearZoneLow:   number | null;  // bearStrike − halfWidth
  bearZoneHigh:  number | null;  // bearStrike + halfWidth
  bearExitBelow: number | null;  // same as bearZoneLow  (strict zone exit)

  // ── Max pain (multi-day) ─────────────────────────────────────────────────
  /** day0 max pain — primary directional target (backward-compat field) */
  maxPain:         number | null;
  /** Max pain for all 3 scanned expiries, ordered by dayIndex */
  maxPainByExpiry: MaxPainEntry[];
  /** True if day0 and day1 max pain are on opposite sides of current price */
  signalConflict:  boolean;

  // ── TP targets ──────────────────────────────────────────────────────────
  bullTpTarget:     number | null;
  bullTpExpiry:     string | null;
  bullTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;

  bearTpTarget:     number | null;
  bearTpExpiry:     string | null;
  bearTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;

  // ── Metadata ─────────────────────────────────────────────────────────────
  /** Primary (day0) expiry label, e.g. "8MAY26" */
  expiryUsed:       string | null;
  /** All 3 expiry labels scanned */
  expiriesUsed:     string[];
  /** Total OI of the day0 expiry */
  expiryOI:         number | null;
  /** Urgency-weighted put OI at bull strike */
  bullOI:           number | null;
  /** Urgency-weighted call OI at bear strike */
  bearOI:           number | null;
  insufficientGap:  boolean;
  /** Reference BTC price passed in (from exchange cache) */
  btcPrice:         number;
  /** Deribit BTC index used for strike selection; null if fetch failed */
  deribitIndexPrice: number | null;
  computedAt:       string;
}

// ── Deribit API ────────────────────────────────────────────────────────────

interface DeribitSummary {
  instrument_name: string;
  open_interest:   number; // BTC contracts
}

async function fetchDeribitBtcIndex(): Promise<number | null> {
  try {
    const res = await fetch(
      `${DERIBIT_API}/get_index_price?index_name=btc_usd`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { index_price?: number } };
    const p = json.result?.index_price;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

// ── Parsing helpers ────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Parse "26APR26" or "1MAY26" → UTC Date at 08:00 (Deribit expiry time). */
function parseExpiryDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2]];
  if (month === undefined) return null;
  return new Date(Date.UTC(2000 + parseInt(m[3], 10), month, parseInt(m[1], 10), 8, 0, 0));
}

interface Parsed {
  expiry:     string;
  expiryDate: Date;
  strike:     number;
  type:       "C" | "P";
  oi:         number;
}

function parseInstrument(name: string, oi: number): Parsed | null {
  const parts = name.split("-");
  if (parts.length !== 4 || parts[0] !== "BTC") return null;
  const strike = parseInt(parts[2], 10);
  if (isNaN(strike) || strike <= 0) return null;
  if (parts[3] !== "C" && parts[3] !== "P") return null;
  const expiryDate = parseExpiryDate(parts[1]);
  if (!expiryDate) return null;
  return { expiry: parts[1], expiryDate, strike, type: parts[3] as "C" | "P", oi };
}

/** Build per-strike {callOI, putOI} map from a list of parsed instruments. */
function buildStrikeMap(items: Parsed[]): Map<number, { callOI: number; putOI: number }> {
  const map = new Map<number, { callOI: number; putOI: number }>();
  for (const p of items) {
    const e = map.get(p.strike) ?? { callOI: 0, putOI: 0 };
    if (p.type === "C") e.callOI += p.oi;
    else                e.putOI  += p.oi;
    map.set(p.strike, e);
  }
  return map;
}

/**
 * Max Pain = the strike where total ITM option payout to holders is minimised.
 * This is the price MMs actively push toward before expiry.
 */
function computeMaxPain(
  strikes: Map<number, { callOI: number; putOI: number }>,
): number | null {
  const list = [...strikes.keys()].sort((a, b) => a - b);
  if (!list.length) return null;
  let best = list[0]; let minPayout = Infinity;
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

function clampZoneHalfWidth(raw: number | null | undefined): number {
  const v = raw ?? DEFAULT_ZONE_HALF_WIDTH_USD;
  return Math.min(MAX_ZONE_HALF_WIDTH_USD, Math.max(MIN_ZONE_HALF_WIDTH_USD, v));
}

// ── Main export ────────────────────────────────────────────────────────────

export async function computeOptionsZones(
  currentBtcPrice: number,
  opts?: { zoneHalfWidthUsd?: number | null },
): Promise<OptionsZones> {
  const halfWidth = clampZoneHalfWidth(opts?.zoneHalfWidthUsd ?? null);

  // Use Deribit index for above/below-strike comparisons — exchange BTCUSDT
  // can sit a few hundred dollars away from true BTC index price.
  const deribitIndexPrice = await fetchDeribitBtcIndex();
  const spot = deribitIndexPrice ?? currentBtcPrice;

  const empty = (): OptionsZones => ({
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null,
    maxPain: null, maxPainByExpiry: [], signalConflict: false,
    bullTpTarget: null, bullTpExpiry: null, bullTpConfidence: null,
    bearTpTarget: null, bearTpExpiry: null, bearTpConfidence: null,
    expiryUsed: null, expiriesUsed: [], expiryOI: null,
    bullOI: null, bearOI: null,
    insufficientGap: false,
    btcPrice: currentBtcPrice,
    deribitIndexPrice,
    computedAt: new Date().toISOString(),
  });

  // ── Fetch option book ────────────────────────────────────────────────────
  const res = await fetch(
    `${DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Deribit API ${res.status}`);
  const json = await res.json() as { result?: DeribitSummary[] };

  const nowMs       = Date.now();
  const maxWindowMs = MAX_DAYS_WINDOW * 24 * 60 * 60 * 1000;

  // ── Group by expiry (un-expired, within 7-day window) ────────────────────
  const byExpiry = new Map<string, { expiryDate: Date; totalOI: number; items: Parsed[] }>();
  for (const item of json.result ?? []) {
    if (item.open_interest <= 0) continue;
    const p = parseInstrument(item.instrument_name, item.open_interest);
    if (!p) continue;
    const msTillExpiry = p.expiryDate.getTime() - nowMs;
    if (msTillExpiry <= 0 || msTillExpiry > maxWindowMs) continue;
    const e = byExpiry.get(p.expiry) ?? { expiryDate: p.expiryDate, totalOI: 0, items: [] };
    e.totalOI += p.oi;
    e.items.push(p);
    byExpiry.set(p.expiry, e);
  }

  if (!byExpiry.size) return empty();

  // ── Sort by nearest date first — day0, day1, day2 ───────────────────────
  // Date-based ordering preserves the temporal urgency meaning of the weights.
  const sortedByDate = [...byExpiry.entries()].sort(
    (a, b) => a[1].expiryDate.getTime() - b[1].expiryDate.getTime(),
  );

  // Take the next DAYS_TO_SCAN (3) un-expired expiries
  const days = sortedByDate.slice(0, DAYS_TO_SCAN);
  if (!days.length) return empty();

  // ── Max pain per expiry ──────────────────────────────────────────────────
  const maxPainByExpiry: MaxPainEntry[] = days.map(([expiry, { totalOI, items }], dayIndex) => {
    const strikeMap = buildStrikeMap(items);
    const maxPain   = computeMaxPain(strikeMap) ?? 0;
    return { expiry, maxPain, totalOI, dayIndex };
  });

  const day0MaxPain = maxPainByExpiry[0]?.maxPain ?? null;

  // ── Signal conflict: do day0 and day1 max pains pull in opposite directions?
  // Conflict means MMs on different expiries have competing incentives today.
  let signalConflict = false;
  if (maxPainByExpiry.length >= 2) {
    const d0 = maxPainByExpiry[0].maxPain;
    const d1 = maxPainByExpiry[1].maxPain;
    // If spot is between d0 and d1 (or they're on opposite sides of spot)
    // → the near-term expiry wants price to go one way, next day wants it the other
    signalConflict = (d0 < spot) !== (d1 < spot);
  }

  // ── Build urgency maps across all 3 expiries ─────────────────────────────
  //
  // urgency(strike) = (1 / (dist_pct + PROXIMITY_BUFFER)) × Σ(rawOI × expiry_weight)
  //
  // The proximity factor is identical for a given strike regardless of which
  // expiry the OI comes from (same physical strike, same distance from spot).
  // So we first accumulate weighted_OI per strike, then apply proximity once.

  const weightedPutOI  = new Map<number, number>();
  const weightedCallOI = new Map<number, number>();

  for (const [dayIdx, [, { items }]] of days.entries()) {
    const w = EXPIRY_WEIGHTS[dayIdx] ?? 1.0;
    for (const p of items) {
      const distPct = Math.abs(p.strike - spot) / spot;
      if (distPct > MAX_REACH_PCT) continue;   // unreachable today — exclude
      const contrib = p.oi * w;
      if (p.type === "P") {
        weightedPutOI.set(p.strike, (weightedPutOI.get(p.strike) ?? 0) + contrib);
      } else {
        weightedCallOI.set(p.strike, (weightedCallOI.get(p.strike) ?? 0) + contrib);
      }
    }
  }

  // Apply proximity factor to get final urgency scores
  const putUrgency  = new Map<number, number>();
  const callUrgency = new Map<number, number>();

  for (const [strike, wOI] of weightedPutOI) {
    const distPct = Math.abs(strike - spot) / spot;
    putUrgency.set(strike, wOI / (distPct + PROXIMITY_BUFFER));
  }
  for (const [strike, wOI] of weightedCallOI) {
    const distPct = Math.abs(strike - spot) / spot;
    callUrgency.set(strike, wOI / (distPct + PROXIMITY_BUFFER));
  }

  // ── Select bull (put below spot) and bear (call above spot) strikes ──────
  //
  // Minimum distance: require the ZONE (not just the strike) to be fully on the
  // correct side of spot. This prevents near-ATM strikes winning on the proximity
  // amplifier when the zone would sit essentially at current price.
  //   Bull: bullStrike + halfWidth < spot  (entire bull zone below spot)
  //   Bear: bearStrike - halfWidth > spot  (entire bear zone above spot)
  //
  // TP target: nearest max pain in the correct direction with MIN_TP_USD clearance
  // from the zone edge.  If the highest urgency strike fails, we fall through to
  // the next best (fallback iteration) instead of immediately returning null.

  const findTp = (
    zoneEdge: number,
    direction: "bull" | "bear",
  ): { tpPrice: number; tpExpiry: string; tpConfidence: "HIGH" | "MEDIUM" | "LOW" } | null => {
    const candidates = maxPainByExpiry.filter(({ maxPain }) =>
      direction === "bull"
        ? maxPain >= zoneEdge + MIN_TP_USD
        : maxPain <= zoneEdge - MIN_TP_USD,
    );
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) =>
      direction === "bull"
        ? a.maxPain - b.maxPain   // ascending  → pick lowest qualifying (first TP to reach)
        : b.maxPain - a.maxPain,  // descending → pick highest qualifying
    );
    const best = sorted[0];
    const tpConfidence: "HIGH" | "MEDIUM" | "LOW" =
      best.dayIndex === 0 ? "HIGH" : best.dayIndex === 1 ? "MEDIUM" : "LOW";
    return { tpPrice: best.maxPain, tpExpiry: best.expiry, tpConfidence };
  };

  // Sort candidates by urgency descending, filtered by minimum distance
  const sortedPuts = [...putUrgency.entries()]
    .filter(([strike]) => strike + halfWidth < spot)
    .sort(([, a], [, b]) => b - a);

  const sortedCalls = [...callUrgency.entries()]
    .filter(([strike]) => strike - halfWidth > spot)
    .sort(([, a], [, b]) => b - a);

  let bullStrike: number | null = null;
  let bullWeightedOI = 0;
  let bullTp: ReturnType<typeof findTp> = null;

  for (const [strike] of sortedPuts) {
    const tp = findTp(strike + halfWidth, "bull");
    if (tp) {
      bullStrike    = strike;
      bullWeightedOI = weightedPutOI.get(strike) ?? 0;
      bullTp        = tp;
      break;
    }
  }

  let bearStrike: number | null = null;
  let bearWeightedOI = 0;
  let bearTp: ReturnType<typeof findTp> = null;

  for (const [strike] of sortedCalls) {
    const tp = findTp(strike - halfWidth, "bear");
    if (tp) {
      bearStrike    = strike;
      bearWeightedOI = weightedCallOI.get(strike) ?? 0;
      bearTp        = tp;
      break;
    }
  }

  // ── Gap check ────────────────────────────────────────────────────────────
  // Require at least $500 between the top of the bull zone and bottom of bear zone.
  // Using zone edges (not raw strikes) so the check reflects actual price overlap risk.
  const bullZoneHighForGap = bullStrike !== null ? bullStrike + halfWidth : null;
  const bearZoneLowForGap  = bearStrike !== null ? bearStrike - halfWidth : null;
  const gap = bullZoneHighForGap !== null && bearZoneLowForGap !== null
    ? bearZoneLowForGap - bullZoneHighForGap : 0;
  const insufficientGap = gap > 0 && gap < 500; // min $500 between zone edges

  // ── Assemble result ──────────────────────────────────────────────────────
  const expiriesUsed    = days.map(([label]) => label);
  const [day0Label, day0Data] = days[0];

  return {
    bullStrike,
    bullZoneLow:   bullStrike !== null ? bullStrike - halfWidth : null,
    bullZoneHigh:  bullStrike !== null ? bullStrike + halfWidth : null,
    bullExitAbove: bullStrike !== null ? bullStrike + halfWidth : null,

    bearStrike,
    bearZoneLow:   bearStrike !== null ? bearStrike - halfWidth : null,
    bearZoneHigh:  bearStrike !== null ? bearStrike + halfWidth : null,
    bearExitBelow: bearStrike !== null ? bearStrike - halfWidth : null,

    maxPain:         day0MaxPain,
    maxPainByExpiry,
    signalConflict,

    bullTpTarget:     bullTp?.tpPrice     ?? null,
    bullTpExpiry:     bullTp?.tpExpiry    ?? null,
    bullTpConfidence: bullTp?.tpConfidence ?? null,

    bearTpTarget:     bearTp?.tpPrice     ?? null,
    bearTpExpiry:     bearTp?.tpExpiry    ?? null,
    bearTpConfidence: bearTp?.tpConfidence ?? null,

    expiryUsed:   day0Label,
    expiriesUsed,
    expiryOI:     day0Data.totalOI,
    bullOI:       bullWeightedOI > 0 ? Math.round(bullWeightedOI) : null,
    bearOI:       bearWeightedOI > 0 ? Math.round(bearWeightedOI) : null,
    insufficientGap,
    btcPrice:     currentBtcPrice,
    deribitIndexPrice,
    computedAt:   new Date().toISOString(),
  };
}
