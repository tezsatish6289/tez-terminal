/**
 * Deribit-based zone suggester — "closest big cluster + IV-derived sizing".
 *
 * Rewritten 2026-05-19. Replaces the legacy urgency formula
 *   urgency(s) = weighted_OI(s) / (distance_pct + 0.005)
 * which had a fatal "nearest-cluster trap": the proximity amplifier
 * routinely picked the strike right next to spot (often a broken near-spot
 * support) over genuinely strong walls 2–3% away.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Algorithm (v2 — current)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Zone *selection* uses ALL-EXPIRY OI for ranking, inside a window
 * around day-0 max pain whose width is the max of:
 *
 *   (a) IV-derived 1-σ daily move × 2.5 — "expand the window when
 *       price is more likely to travel far today";
 *   (b) ANCHOR_STRIKES_PER_SIDE × strikeGridUsd — "always include
 *       at least N closest Deribit strikes either side regardless
 *       of IV", because walls form at the listed strike grid and
 *       low-IV regimes still have meaningful gamma at the closest
 *       strikes.
 *
 * Plus a defence-in-depth near-term (day-0+1) OI floor that rejects
 * the rare strike with huge all-expiry OI but no daily presence
 * (premium magnets like ETH $1,800 puts).
 *
 * Strike↔max-pain gap and TP-room minimum are both 2 × halfWidth
 * (auto-tuned to IV via halfWidth). The previous operator override
 * (`maxPainMinDistanceUsd`) was removed 2026-05-22 — dormant at
 * default settings, footgun if raised, defended none of the failure
 * modes the picker actually faces.
 *
 * TP / magnet still uses TODAY's (day-0) max pain only — unchanged.
 *
 *   1. Fetch all options for the asset from Deribit (single REST call —
 *      returns OI + IV + underlying price for every instrument).
 *
 *   2. Compute ATM IV from the nearest un-expired expiry. This drives
 *      every size in the algorithm — reach, half-width, panic detection.
 *      No arbitrary $-numbers anywhere.
 *
 *   3. Sizes (all from ATM IV via the Black-Scholes σ formula):
 *        reach     = 1-σ over 1 day       = spot × IV × √(1/365)
 *        halfWidth = 1-σ over 4 hours     = spot × IV × √(4/8760)
 *           — floored at 2σ × 15 min (so the confirmation gate has room)
 *           — capped  at 2% × spot (so SL distance ≤ 3%, the engine's limit)
 *
 *   4. Aggregate OI per strike — all-expiry for ranking, day-0+1 for
 *      the premium-magnet sanity filter.
 *
 *   5. Pick the **most potent** cluster on each side, **anchored near
 *      day-0 max pain** (not far-away structural walls):
 *        bull (puts):  below maxPain, within an anchor span under the pin
 *        bear (calls): above maxPain, within an anchor span over the pin
 *      Potency = OI ≥ per-asset floor AND ≥ 25% of pool max in window.
 *      Priority: highest OI, then closest to max pain.
 *      Bands must sandwich the pin; min gap = max(2×halfWidth, configured).
 *      Sticky: while spot stays inside a published band, keep that band.
 *
 *   6. Today's max pain (day-0 only) is the magnet. Directional gate:
 *        bullActionable: maxPain > spot + MIN_PIN_GAP
 *        bearActionable: maxPain < spot - MIN_PIN_GAP
 *      where MIN_PIN_GAP = 0.5 × halfWidth. If the pin is too close to
 *      spot, neither side is actionable (chop regime).
 *
 *   7. TP target = day-0 max pain, subject to room check:
 *        bull: maxPain ≥ bullZoneHigh + 3 × halfWidth
 *        bear: maxPain ≤ bearZoneLow  − 3 × halfWidth
 *
 *   8. Panic regime check: ATM IV ≥ 70% (absolute) OR front IV >
 *      1.1× week-out IV (term-structure inversion). Suppresses fresh
 *      entries via `inPanicRegime` — open trades unaffected.
 *
 *   9. `signalConflict`: day-0 and day-1 max pains on opposite sides
 *      of spot. Same treatment as panic regime — no fresh entries.
 *
 *  10. Half-width has a strike-grid floor too: never narrower than half
 *      the spacing between adjacent listed strikes (so the band can't
 *      sit between two strikes without touching either).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Multi-asset design
 * ──────────────────────────────────────────────────────────────────────────
 *
 * BTC ships first. The algorithm is identical for any asset with a liquid
 * Deribit option chain (BTC / ETH / SOL). Only thing that differs per asset:
 *   - Deribit currency code ("BTC" / "ETH" / "SOL")
 *   - Strike grid spacing (BTC=500, ETH=50, SOL=5 near ATM)
 * Both live in `ASSET_SPEC` below. Adding ETH/SOL is one row each.
 *
 * XRP (and anything else without a real options market) does NOT use this
 * module — XRP zones will be derived from Bybit perp OI clusters in a
 * separate file.
 *
 * Date context: always dynamic from `Date.now()` — never hardcoded.
 */

import type { ZoneBotAsset } from "./zone-bot-config";
import {
  applyStickyZones,
  type ZoneBandSnapshot,
} from "./options-zone-sticky";

const DERIBIT_API = "https://www.deribit.com/api/v2/public";

// ── Algorithm constants (the only "magic" left) ───────────────────────────
//
// Every value here has a stated derivation or empirical anchor. None of
// them are tuning knobs picked by gut.

/** Secondary potency: OI ≥ this fraction of the tallest bar in the anchor window. */
const MIN_CLUSTER_PCT_OF_MAX = 0.25;

/** Max distance from day-0 max pain for zone-center search, scaled by
 *  the IV-derived 1-σ daily move. Sets the "in a volatile market we
 *  expect price to travel further today, so include strikes further
 *  out" term of the anchor span. The other term is the strike-grid
 *  floor — see `ANCHOR_STRIKES_PER_SIDE` below. The window is the
 *  max of the two. */
const MAX_PAIN_ANCHOR_REACH_MULT = 2.5;

/** Strike-grid floor on the anchor window — "search at least this many
 *  Deribit strikes either side of max pain." Replaces the previous
 *  per-asset `maxPainAnchorPct` percentages (3% / 8% / 12%) which were
 *  hand-picked numbers; this is one algorithm constant that defers
 *  per-asset behaviour to `strikeGridUsd` (a market fact about Deribit,
 *  not a tuning knob).
 *
 *    BTC: 4 × $500 = $2,000  (IV-derived usually wider)
 *    ETH: 4 × $50  = $200    (catches $2,000 puts at $125 from max pain)
 *    SOL: 4 × $5   = $20     (covers ~4 strikes per side at $5 grid)
 */
const ANCHOR_STRIKES_PER_SIDE = 4;

/** Near-term (day-0+1) OI floor a strike must clear, as a fraction of
 *  per-asset `minClusterOi`. Defence-in-depth filter — kicks in for the
 *  rare strike that has substantial all-expiry OI but zero daily
 *  presence (which would otherwise out-rank legitimate walls). The
 *  primary proximity filter is `ANCHOR_STRIKES_PER_SIDE × strikeGridUsd`
 *  above. */
const NEAR_TERM_OI_FLOOR_FRAC_OF_MIN_CLUSTER = 0.05;

/** Reach gate = 1-σ daily move. 68% probability price visits any strike
 *  inside this band today. Sourced from the market's own IV pricing. */
const REACH_HORIZON_DAYS = 1;

/** Half-width = 1-σ over a 4-hour session. Captures one trading session's
 *  drift around the strike center. 4h matches Asian/EU/US session lengths
 *  and the most-watched mid-timeframe candle. */
const HALFWIDTH_HORIZON_HOURS = 4;

/** Half-width floor = 2-σ over the 15-min cron tick. Ensures the
 *  confirmation gate has at least 95% of single-tick noise covered, so
 *  normal wicks don't constantly trip "zone floor broken". */
const HALFWIDTH_FLOOR_CONFIRMATION_MIN = 15;
const HALFWIDTH_FLOOR_SIGMA_MULT = 2.0;

/** Half-width cap = 2% of spot. Beyond this, `bullZoneLow × 0.99` puts SL
 *  distance over 3%, which `zone-bot-engine.MAX_SL_DISTANCE_PCT` rejects.
 *  Wider bands are dead weight. */
const HALFWIDTH_CAP_PCT_OF_SPOT = 0.02;

/** Pin-gap = 0.5 × halfWidth. Max pain must pull at least this far from
 *  spot in the trade's direction before either side is actionable.
 *  Otherwise spot ≈ max pain = chop regime, neither direction has edge. */
const MIN_PIN_GAP_PCT_OF_HALFWIDTH = 0.5;

/** Strike ↔ max-pain gap AND TP-room minimum, both expressed as a
 *  multiple of half-width. Zone center must sit at least this many
 *  half-widths away from max pain for: (a) candidate strike eligibility
 *  in the cluster picker, (b) the TP-room reach check, (c) the manual
 *  punch gate. One number, three consistent uses.
 *
 *  Hardcoded at 2× because that yields a clean ≥2:1 R-multiple when
 *  SL sits one half-width outside the zone (the engine's anchor). The
 *  previous operator-facing override (`maxPainMinDistanceUsd`) was
 *  removed 2026-05-22 — it was either dormant (overridden by this
 *  2×halfWidth floor) or a footgun (setting it too high silently
 *  blocked every candidate via the TP-room check). With half-width
 *  already auto-derived from ATM IV, this number self-tunes to
 *  regime: calm market → tight band → tight gap; panic IV → wider
 *  band → wider gap. */
const MAX_PAIN_GAP_HALFWIDTHS = 2.0;

/** Convenience accessor used at the manual-gate call site. */
export function maxPainGapUsd(halfWidthUsd: number): number {
  return MAX_PAIN_GAP_HALFWIDTHS * halfWidthUsd;
}

/** Panic regime: ATM IV at or above this triggers "no fresh entries" mode.
 *  Calibrated to BTC: 30–50% is normal, 70%+ has historically marked event
 *  days (FTX collapse, COVID flush, LUNA, etc.). */
const PANIC_IV_THRESHOLD = 0.70;

/** Panic regime via term-structure inversion: front IV > 1.1× week-out IV.
 *  Backwardation is the textbook stressed-regime shape. */
const BACKWARDATION_RATIO_THRESHOLD = 1.10;

/** Fallback IV when Deribit returns an unusable response (shouldn't happen
 *  in practice — every instrument has mark_iv — but guards against a
 *  malformed payload taking the whole bot offline). */
const FALLBACK_IV = 0.55;

const MAX_DAYS_WINDOW = 7; // expiries beyond this are too far to be magnets

// ── Per-asset specifications ──────────────────────────────────────────────

interface AssetSpec {
  /** Deribit currency code in the REST URL (`?currency=BTC|ETH|SOL`). */
  deribitCurrency: string;
  /** Approximate strike-grid spacing near ATM, in USD. Two uses:
   *  (a) floor on half-width so the band can't sit narrower than the
   *      gap between adjacent listed strikes;
   *  (b) floor on the anchor window
   *      (`ANCHOR_STRIKES_PER_SIDE × strikeGridUsd`) so the picker
   *      always sees at least the closest N strikes either side of
   *      max pain regardless of IV. */
  strikeGridUsd: number;
  /** Annualisation horizon in years for the IV → σ conversion. Black-Scholes
   *  convention is 365 days/year (calendar, not trading days) for crypto. */
  yearDays: number;
  /** Index endpoint name. Deribit uses `btc_usd`, `eth_usd`, `sol_usdc`. */
  indexEndpoint: string;
  /** Minimum all-expiry OI (contracts) at a strike to count as a wall. */
  minClusterOi: number;
}

const ASSET_SPEC: Record<ZoneBotAsset, AssetSpec> = {
  btc: {
    deribitCurrency: "BTC",
    strikeGridUsd:   500,
    yearDays:        365,
    indexEndpoint:   "btc_usd",
    minClusterOi:    1000,
  },
  eth: {
    deribitCurrency: "ETH",
    strikeGridUsd:   50,
    yearDays:        365,
    indexEndpoint:   "eth_usd",
    minClusterOi:    200,
  },
  sol: {
    deribitCurrency: "SOL",
    strikeGridUsd:   5,
    yearDays:        365,
    indexEndpoint:   "sol_usdc",
    minClusterOi:    50,
  },
};

// ── Types ─────────────────────────────────────────────────────────────────

export interface MaxPainEntry {
  expiry:   string;   // e.g. "8MAY26"
  maxPain:  number;
  totalOI:  number;
  dayIndex: number;   // 0 = nearest un-expired
}

export interface OptionsZones {
  // ── Zone bands ──────────────────────────────────────────────────────────
  bullStrike:    number | null;
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bearStrike:    number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null;

  // ── Max pain (multi-day picture; day-0 drives TP/magnet) ─────────────────
  maxPain:         number | null;
  maxPainByExpiry: MaxPainEntry[];
  signalConflict:  boolean;

  // ── TP targets (= today's max pain when conditions hold) ─────────────────
  bullTpTarget:     number | null;
  bullTpExpiry:     string | null;
  bullTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  bearTpTarget:     number | null;
  bearTpExpiry:     string | null;
  bearTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;

  // ── Actionable flags (new in v2) ─────────────────────────────────────────
  /** True iff bull zone exists, magnet pulls up, TP-room satisfied, and
   *  no panic/conflict regime. The engine should consult these instead of
   *  re-deriving the conditions itself. */
  bullActionable: boolean;
  bearActionable: boolean;
  /** Human-readable "why not actionable" reason — surfaced into the UI
   *  status line so the bot's idle behaviour isn't a black box. */
  notActionableReason: string | null;

  // ── Regime context (new in v2) ───────────────────────────────────────────
  atmIV:               number;   // ATM IV used for the size math (0..1 decimal)
  ivBackwardation:     number;   // frontIV / weekIV — > 1 = stressed
  inPanicRegime:       boolean;
  halfWidthUsd:        number;   // the value the bands were built with
  maxReachUsd:         number;   // half-side reach distance (1σ × 1d)
  minPinGapUsd:        number;
  bullClusterShare:    number | null;  // share of side OI held by chosen bull strike
  bearClusterShare:    number | null;

  // ── Metadata ─────────────────────────────────────────────────────────────
  expiryUsed:        string | null;       // day-0 expiry label
  expiriesUsed:      string[];             // all expiry labels considered
  expiryOI:          number | null;        // day-0 expiry total OI
  bullOI:            number | null;        // all-expiry OI at chosen bull strike
  bearOI:            number | null;        // all-expiry OI at chosen bear strike
  insufficientGap:   boolean;
  /** USD span used to search for walls near day-0 max pain. */
  maxPainAnchorSpanUsd: number;
  /** Prior band held because spot is still inside it. */
  bullLocked: boolean;
  bearLocked: boolean;
  btcPrice:          number;               // input spot (kept name for back-compat)
  deribitIndexPrice: number | null;
  computedAt:        string;
}

// ── Deribit API ───────────────────────────────────────────────────────────

interface DeribitSummary {
  instrument_name:   string;
  open_interest:     number;
  mark_iv?:          number;
  underlying_price?: number;
}

async function fetchDeribitIndex(endpoint: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${DERIBIT_API}/get_index_price?index_name=${endpoint}`,
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

// ── Parsing helpers ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

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
  iv?:        number;
}

function parseInstrument(name: string, oi: number, iv?: number): Parsed | null {
  const parts = name.split("-");
  // BTC-31JUL26-83000-C → 4 parts; ETH/SOL same shape.
  if (parts.length !== 4) return null;
  const strike = parseInt(parts[2], 10);
  if (isNaN(strike) || strike <= 0) return null;
  if (parts[3] !== "C" && parts[3] !== "P") return null;
  const expiryDate = parseExpiryDate(parts[1]);
  if (!expiryDate) return null;
  return { expiry: parts[1], expiryDate, strike, type: parts[3] as "C" | "P", oi, iv };
}

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

// ── IV helpers ────────────────────────────────────────────────────────────

/** ATM IV = average of call+put IVs at the strike closest to spot, taken
 *  from the soonest un-expired expiry with enough liquid quotes. */
function computeAtmIv(itemsByExpiry: Map<string, Parsed[]>, spot: number): number {
  // Walk expiries in date order; use the first that has any usable IV data.
  const sorted = [...itemsByExpiry.entries()].sort(
    (a, b) => (a[1][0]?.expiryDate.getTime() ?? 0) - (b[1][0]?.expiryDate.getTime() ?? 0),
  );
  for (const [, items] of sorted) {
    const withIv = items.filter((p) => typeof p.iv === "number" && p.iv > 0);
    if (!withIv.length) continue;
    // Find strike closest to spot.
    const closest = withIv.reduce((best, p) =>
      Math.abs(p.strike - spot) < Math.abs(best.strike - spot) ? p : best,
    );
    const atmStrike = closest.strike;
    const atmItems = withIv.filter((p) => p.strike === atmStrike);
    if (!atmItems.length) continue;
    const avg = atmItems.reduce((sum, p) => sum + (p.iv ?? 0), 0) / atmItems.length;
    // Deribit reports IV as a percent (e.g. 31.69), normalise to decimal.
    return avg > 5 ? avg / 100 : avg;
  }
  return FALLBACK_IV;
}

/** IV-term backwardation indicator: frontIV / week-out IV.
 *  Returns 1.0 if either reading is unavailable (neutral). */
function computeIvBackwardation(itemsByExpiry: Map<string, Parsed[]>, spot: number, now: number): number {
  const sorted = [...itemsByExpiry.entries()]
    .map(([label, items]) => ({
      label,
      items,
      hoursOut: ((items[0]?.expiryDate.getTime() ?? now) - now) / 3.6e6,
    }))
    .sort((a, b) => a.hoursOut - b.hoursOut);

  const front = sorted[0];
  const weekOut = sorted.find((e) => e.hoursOut >= 24 * 6); // ≥ 6 days out
  if (!front || !weekOut) return 1.0;

  const frontIv = computeAtmIv(new Map([[front.label, front.items]]), spot);
  const weekIv  = computeAtmIv(new Map([[weekOut.label, weekOut.items]]), spot);
  if (frontIv <= 0 || weekIv <= 0) return 1.0;
  return frontIv / weekIv;
}

// ── Size derivations (all from spot + IV — no magic) ──────────────────────

interface DerivedSizes {
  maxReachUsd:   number;
  halfWidthUsd:  number;
  minPinGapUsd:  number;
}

function deriveSizes(spot: number, atmIV: number, asset: ZoneBotAsset): DerivedSizes {
  const spec = ASSET_SPEC[asset];
  const yr   = spec.yearDays;

  // 1-σ over the relevant time horizon, in USD.
  const sigmaForDays    = (d: number) => spot * atmIV * Math.sqrt(d / yr);
  const sigmaForHours   = (h: number) => sigmaForDays(h / 24);
  const sigmaForMinutes = (m: number) => sigmaForDays(m / (24 * 60));

  const maxReachUsd = sigmaForDays(REACH_HORIZON_DAYS);

  const halfWidthIdeal = sigmaForHours(HALFWIDTH_HORIZON_HOURS);
  const halfWidthFloor = Math.max(
    HALFWIDTH_FLOOR_SIGMA_MULT * sigmaForMinutes(HALFWIDTH_FLOOR_CONFIRMATION_MIN),
    spec.strikeGridUsd / 2,
  );
  const halfWidthCap = HALFWIDTH_CAP_PCT_OF_SPOT * spot;
  const halfWidthUsd = Math.max(
    halfWidthFloor,
    Math.min(halfWidthIdeal, halfWidthCap),
  );

  return {
    maxReachUsd,
    halfWidthUsd,
    minPinGapUsd: MIN_PIN_GAP_PCT_OF_HALFWIDTH * halfWidthUsd,
  };
}

// ── Cluster picker (the heart of the new algorithm) ───────────────────────

interface ClusterPick {
  strike:      number;
  oi:          number;
  shareOfSide: number;  // fraction of side's total OI within reach
}

interface ClusterPickInput {
  oiByStrike:            Map<number, number>;
  /** Day-0+1 OI per strike. Used only for the premium-magnet sanity
   *  filter — a strike whose near-term OI is below `nearTermOiFloor`
   *  is rejected regardless of its all-expiry total. */
  nearTermOiByStrike:    Map<number, number>;
  nearTermOiFloor:       number;
  spot:                  number;
  side:                  "put" | "call";
  maxReachUsd:           number;
  zoneHalfWidthUsd:      number;
  day0MaxPain:           number | null;
  minClusterOi:          number;
  maxPainAnchorSpanUsd:  number;
}

function deriveMaxPainAnchorSpan(
  maxReachUsd: number,
  strikeGridUsd: number,
): number {
  return Math.max(
    maxReachUsd * MAX_PAIN_ANCHOR_REACH_MULT,
    ANCHOR_STRIKES_PER_SIDE * strikeGridUsd,
  );
}

function filterPotentNearMaxPain(
  input: ClusterPickInput,
  anchorSpanUsd: number,
): Array<[number, number]> {
  const {
    oiByStrike,
    nearTermOiByStrike,
    nearTermOiFloor,
    side,
    zoneHalfWidthUsd,
    day0MaxPain,
    minClusterOi,
  } = input;
  const half = zoneHalfWidthUsd;
  // The strike↔max-pain gap is hardcoded at 2 × halfWidth — see
  // MAX_PAIN_GAP_HALFWIDTHS for the rationale.
  const mpGap = maxPainGapUsd(half);

  if (day0MaxPain == null) return [];

  const pool = [...oiByStrike.entries()].filter(([strike, oi]) => {
    if (oi <= 0) return false;

    if (side === "put") {
      const upper = day0MaxPain - mpGap;
      const lower = day0MaxPain - anchorSpanUsd;
      if (strike >= upper) return false;
      if (strike < lower) return false;
      if (strike + half >= day0MaxPain) return false;
    } else {
      const lower = day0MaxPain + mpGap;
      const upper = day0MaxPain + anchorSpanUsd;
      if (strike <= lower) return false;
      if (strike > upper) return false;
      if (strike - half <= day0MaxPain) return false;
    }

    // Premium-magnet sanity filter — see file header. A strike with
    // tens of thousands of all-expiry OI but ~zero day-0+1 OI is a
    // premium-seller magnet, not a wall that pins price. Real walls
    // (even ones concentrated in next-weekly) always have *some*
    // daily-expiry OI.
    const nearTerm = nearTermOiByStrike.get(strike) ?? 0;
    if (nearTerm < nearTermOiFloor) return false;

    return true;
  });

  if (!pool.length) return [];

  const poolMax = pool.reduce((m, [, oi]) => Math.max(m, oi), 0);
  const relThreshold = MIN_CLUSTER_PCT_OF_MAX * poolMax;
  return pool.filter(([, oi]) => oi >= minClusterOi && oi >= relThreshold);
}

function pickPotentClusterNearMaxPain(
  input: ClusterPickInput,
): ClusterPick | null {
  const { oiByStrike, day0MaxPain, maxPainAnchorSpanUsd } = input;
  if (day0MaxPain == null) return null;

  const tryPick = (span: number): ClusterPick | null => {
    const potent = filterPotentNearMaxPain(input, span);
    if (!potent.length) return null;

    const sideTotal = [...oiByStrike.entries()].reduce((s, [, oi]) => s + oi, 0);
    const [chosenStrike, chosenOi] = potent.reduce((best, cur) => {
      const [, bestOi] = best;
      const [, curOi] = cur;
      if (curOi > bestOi) return cur;
      if (curOi < bestOi) return best;
      const bestDist = Math.abs(best[0] - day0MaxPain);
      const curDist = Math.abs(cur[0] - day0MaxPain);
      return curDist < bestDist ? cur : best;
    });

    return {
      strike: chosenStrike,
      oi: chosenOi,
      shareOfSide: sideTotal > 0 ? chosenOi / sideTotal : 0,
    };
  };

  return (
    tryPick(maxPainAnchorSpanUsd) ??
    tryPick(maxPainAnchorSpanUsd * 1.75)
  );
}

// ── Main entry point ──────────────────────────────────────────────────────

export interface ComputeOptionsZonesInput {
  asset:        ZoneBotAsset;
  currentPrice: number;
  /** Prior published bands — enables sticky zones while spot is in-band. */
  previousBands?: ZoneBandSnapshot | null;
}

export async function computeOptionsZones(
  input: ComputeOptionsZonesInput,
): Promise<OptionsZones> {
  const { asset, currentPrice } = input;
  const spec = ASSET_SPEC[asset];
  if (!spec) throw new Error(`[options-zones] unknown asset: ${asset}`);

  // Use Deribit index for above/below-strike comparisons — exchange perp
  // price can drift a few hundred dollars from true BTC index.
  const deribitIndexPrice = await fetchDeribitIndex(spec.indexEndpoint);
  const spot              = deribitIndexPrice ?? currentPrice;

  const emptyResult = (atmIV: number, sizes: DerivedSizes, reason: string): OptionsZones => ({
    bullStrike: null, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearStrike: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null,
    maxPain: null, maxPainByExpiry: [], signalConflict: false,
    bullTpTarget: null, bullTpExpiry: null, bullTpConfidence: null,
    bearTpTarget: null, bearTpExpiry: null, bearTpConfidence: null,
    bullActionable: false, bearActionable: false,
    notActionableReason: reason,
    atmIV, ivBackwardation: 1.0, inPanicRegime: false,
    halfWidthUsd: sizes.halfWidthUsd, maxReachUsd: sizes.maxReachUsd,
    minPinGapUsd: sizes.minPinGapUsd,
    bullClusterShare: null, bearClusterShare: null,
    expiryUsed: null, expiriesUsed: [], expiryOI: null,
    bullOI: null, bearOI: null,
    insufficientGap: false,
    maxPainAnchorSpanUsd: deriveMaxPainAnchorSpan(
      sizes.maxReachUsd,
      spec.strikeGridUsd,
    ),
    bullLocked: false,
    bearLocked: false,
    btcPrice: currentPrice, deribitIndexPrice,
    computedAt: new Date().toISOString(),
  });

  // ── Fetch the option chain ────────────────────────────────────────────
  const res = await fetch(
    `${DERIBIT_API}/get_book_summary_by_currency?currency=${spec.deribitCurrency}&kind=option`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Deribit API ${res.status}`);
  const json = (await res.json()) as { result?: DeribitSummary[] };

  const nowMs       = Date.now();
  const maxWindowMs = MAX_DAYS_WINDOW * 24 * 60 * 60 * 1000;

  // Parse all un-expired instruments (within 7-day window for max-pain math;
  // OI aggregation will use everything).
  const allParsed: Parsed[] = [];
  for (const item of json.result ?? []) {
    if (item.open_interest <= 0) continue;
    const p = parseInstrument(item.instrument_name, item.open_interest, item.mark_iv);
    if (!p) continue;
    if (p.expiryDate.getTime() <= nowMs) continue;
    allParsed.push(p);
  }

  if (!allParsed.length) {
    const fallbackSizes = deriveSizes(spot, FALLBACK_IV, asset);
    return emptyResult(FALLBACK_IV, fallbackSizes, "no un-expired option data");
  }

  // ── ATM IV + size derivations ────────────────────────────────────────
  // Group by expiry for IV / max-pain math.
  const itemsByExpiry = new Map<string, Parsed[]>();
  for (const p of allParsed) {
    const arr = itemsByExpiry.get(p.expiry) ?? [];
    arr.push(p);
    itemsByExpiry.set(p.expiry, arr);
  }

  const atmIV           = computeAtmIv(itemsByExpiry, spot);
  const sizes           = deriveSizes(spot, atmIV, asset);
  const ivBackwardation = computeIvBackwardation(itemsByExpiry, spot, nowMs);

  // Strike↔max-pain gap + TP-room minimum, both = 2 × halfWidth. See
  // MAX_PAIN_GAP_HALFWIDTHS for the rationale; no operator override.
  const maxPainGap = maxPainGapUsd(sizes.halfWidthUsd);

  // ── Max-pain per expiry (still useful for UI table) ──────────────────
  // Use day-0, day-1, day-2 expiries within the 7-day window for the
  // multi-day picture. TP/magnet uses day-0 only.
  const sortedExpiries = [...itemsByExpiry.entries()]
    .filter(([, items]) => items[0].expiryDate.getTime() - nowMs < maxWindowMs)
    .sort((a, b) => a[1][0].expiryDate.getTime() - b[1][0].expiryDate.getTime())
    .slice(0, 3);

  const maxPainByExpiry: MaxPainEntry[] = sortedExpiries.map(([expiry, items], dayIndex) => {
    const totalOI   = items.reduce((s, p) => s + p.oi, 0);
    const strikeMap = buildStrikeMap(items);
    const maxPain   = computeMaxPain(strikeMap) ?? 0;
    return { expiry, maxPain, totalOI, dayIndex };
  });

  const day0       = maxPainByExpiry[0] ?? null;
  const day0MaxPain = day0?.maxPain ?? null;

  // Signal conflict: day-0 and day-1 max pains on opposite sides of spot.
  let signalConflict = false;
  if (maxPainByExpiry.length >= 2) {
    const d0 = maxPainByExpiry[0].maxPain;
    const d1 = maxPainByExpiry[1].maxPain;
    signalConflict = (d0 < spot) !== (d1 < spot);
  }

  // ── Panic regime ──────────────────────────────────────────────────────
  const inPanicRegime =
    atmIV >= PANIC_IV_THRESHOLD ||
    ivBackwardation >= BACKWARDATION_RATIO_THRESHOLD;

  // ── Aggregate OI per strike — all-expiry for ranking, near-term for
  //    the premium-magnet sanity filter (see header for rationale).
  const nearTermExpiries = new Set(
    sortedExpiries.slice(0, 2).map(([label]) => label),
  );
  const putOIByStrike      = new Map<number, number>(); // all-expiry, drives ranking
  const callOIByStrike     = new Map<number, number>();
  const nearTermPutOI      = new Map<number, number>(); // day-0+1, gates against magnets
  const nearTermCallOI     = new Map<number, number>();
  for (const p of allParsed) {
    const allMap = p.type === "P" ? putOIByStrike : callOIByStrike;
    allMap.set(p.strike, (allMap.get(p.strike) ?? 0) + p.oi);
    if (nearTermExpiries.has(p.expiry)) {
      const ntMap = p.type === "P" ? nearTermPutOI : nearTermCallOI;
      ntMap.set(p.strike, (ntMap.get(p.strike) ?? 0) + p.oi);
    }
  }

  const maxPainAnchorSpanUsd = deriveMaxPainAnchorSpan(
    sizes.maxReachUsd,
    spec.strikeGridUsd,
  );

  const nearTermOiFloor = Math.max(
    10,
    NEAR_TERM_OI_FLOOR_FRAC_OF_MIN_CLUSTER * spec.minClusterOi,
  );

  const pickInput = (
    side: "put" | "call",
    allMap: Map<number, number>,
    nearTermMap: Map<number, number>,
  ): ClusterPickInput => ({
    oiByStrike: allMap,
    nearTermOiByStrike: nearTermMap,
    nearTermOiFloor,
    spot,
    side,
    maxReachUsd: sizes.maxReachUsd,
    zoneHalfWidthUsd: sizes.halfWidthUsd,
    day0MaxPain,
    minClusterOi: spec.minClusterOi,
    maxPainAnchorSpanUsd,
  });

  const bullPick = pickPotentClusterNearMaxPain(
    pickInput("put", putOIByStrike, nearTermPutOI),
  );
  const bearPick = pickPotentClusterNearMaxPain(
    pickInput("call", callOIByStrike, nearTermCallOI),
  );

  // ── Bands (fresh scan) ────────────────────────────────────────────────
  const half = sizes.halfWidthUsd;
  let bullStrike    = bullPick?.strike ?? null;
  let bullZoneLow   = bullStrike !== null ? bullStrike - half : null;
  let bullZoneHigh  = bullStrike !== null ? bullStrike + half : null;
  let bullExitAbove = bullZoneHigh;
  let bullOI        = bullPick ? Math.round(bullPick.oi) : null;

  let bearStrike    = bearPick?.strike ?? null;
  let bearZoneLow   = bearStrike !== null ? bearStrike - half : null;
  let bearZoneHigh  = bearStrike !== null ? bearStrike + half : null;
  let bearExitBelow = bearZoneLow;
  let bearOI        = bearPick ? Math.round(bearPick.oi) : null;

  let bullClusterShare = bullPick?.shareOfSide ?? null;
  let bearClusterShare = bearPick?.shareOfSide ?? null;

  const { bands: stickyBands, meta: stickyMeta } = applyStickyZones(
    spot,
    {
      bullStrike,
      bullZoneLow,
      bullZoneHigh,
      bullExitAbove,
      bullOI,
      bearStrike,
      bearZoneLow,
      bearZoneHigh,
      bearExitBelow,
      bearOI,
    },
    input.previousBands ?? null,
    (side, strike) =>
      side === "put"
        ? (putOIByStrike.get(strike) ?? 0)
        : (callOIByStrike.get(strike) ?? 0),
    spec.minClusterOi,
  );

  bullStrike = stickyBands.bullStrike;
  bullZoneLow = stickyBands.bullZoneLow;
  bullZoneHigh = stickyBands.bullZoneHigh;
  bullExitAbove = stickyBands.bullExitAbove;
  bullOI = stickyBands.bullOI;
  bearStrike = stickyBands.bearStrike;
  bearZoneLow = stickyBands.bearZoneLow;
  bearZoneHigh = stickyBands.bearZoneHigh;
  bearExitBelow = stickyBands.bearExitBelow;
  bearOI = stickyBands.bearOI;

  // Gap check between bull-top and bear-bottom — informational, retained
  // for UI continuity. The new algorithm picks zones from "closest big
  // cluster"; both sides being too close is generally caught by the
  // dominance filter, but the explicit flag is still useful.
  const gap = bullZoneHigh !== null && bearZoneLow !== null
    ? bearZoneLow - bullZoneHigh : 0;
  const insufficientGap = gap > 0 && gap < 2500;

  // ── TP targets (= day-0 max pain when room allows) ───────────────────
  // TP-room reference point is the zone CENTER (`bullStrike` /
  // `bearStrike`), not the zone edge — bot enters around center, so
  // measuring from the far edge would build in an extra 1 × halfWidth
  // the trade never actually has to traverse. Required gap = 2 ×
  // halfWidth (auto-tunes to IV via halfWidth; previously had an
  // operator-configured floor on top, removed 2026-05-22 — see
  // MAX_PAIN_GAP_HALFWIDTHS).
  const minTpRoomUsd = maxPainGap;

  const bullTpTarget =
    bullStrike !== null && day0MaxPain !== null &&
    day0MaxPain >= bullStrike + minTpRoomUsd
      ? day0MaxPain : null;
  const bullTpExpiry = bullTpTarget !== null ? day0?.expiry ?? null : null;
  const bullTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null =
    bullTpTarget !== null ? "HIGH" : null;

  const bearTpTarget =
    bearStrike !== null && day0MaxPain !== null &&
    day0MaxPain <= bearStrike - minTpRoomUsd
      ? day0MaxPain : null;
  const bearTpExpiry = bearTpTarget !== null ? day0?.expiry ?? null : null;
  const bearTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null =
    bearTpTarget !== null ? "HIGH" : null;

  // ── Directional gate ─────────────────────────────────────────────────
  const magnetPullsUp   = day0MaxPain !== null && day0MaxPain > spot + sizes.minPinGapUsd;
  const magnetPullsDown = day0MaxPain !== null && day0MaxPain < spot - sizes.minPinGapUsd;

  // ── Actionable flags + reason ────────────────────────────────────────
  let notActionableReason: string | null = null;
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const bullActionable =
    !inPanicRegime &&
    !signalConflict &&
    bullStrike !== null &&
    magnetPullsUp &&
    bullTpTarget !== null;

  const bearActionable =
    !inPanicRegime &&
    !signalConflict &&
    bearStrike !== null &&
    magnetPullsDown &&
    bearTpTarget !== null;

  if (!bullActionable && !bearActionable) {
    if (inPanicRegime) {
      notActionableReason = ivBackwardation >= BACKWARDATION_RATIO_THRESHOLD
        ? `Panic regime — IV term-structure inverted (front/week = ${ivBackwardation.toFixed(2)}x)`
        : `Panic regime — ATM IV ${fmtPct(atmIV)} ≥ ${fmtPct(PANIC_IV_THRESHOLD)}`;
    } else if (signalConflict) {
      notActionableReason = "Signal conflict — day-0 and day-1 max pains disagree across spot";
    } else if (day0MaxPain !== null && Math.abs(day0MaxPain - spot) < sizes.minPinGapUsd) {
      notActionableReason = `Pin chop — spot ${fmtUsd(spot)} too close to max pain ${fmtUsd(day0MaxPain)} (gap < ${fmtUsd(sizes.minPinGapUsd)})`;
    } else if (bullStrike === null && bearStrike === null) {
      notActionableReason = day0MaxPain !== null
        ? `No potent cluster within ${fmtUsd(maxPainAnchorSpanUsd)} of max pain ${fmtUsd(day0MaxPain)} (need ≥${spec.minClusterOi.toLocaleString()} OI)`
        : `No potent cluster within reach (±${fmtUsd(sizes.maxReachUsd)} = ${fmtPct(sizes.maxReachUsd / spot)} of spot)`;
    } else if (bullStrike === null && day0MaxPain !== null && day0MaxPain > spot) {
      notActionableReason = `No potent put cluster within ${fmtUsd(maxPainAnchorSpanUsd)} below max pain ${fmtUsd(day0MaxPain)}`;
    } else if (bearStrike === null && day0MaxPain !== null && day0MaxPain > spot) {
      notActionableReason = `No potent call cluster within ${fmtUsd(maxPainAnchorSpanUsd)} above max pain ${fmtUsd(day0MaxPain)}`;
    } else {
      // Surface the actual numbers so the operator can see WHICH gap
      // failed and by how much. Picks the side that has a strike (if
      // both have strikes but neither passes the TP-room check, the
      // bull side is shown first — the magnet direction is already
      // implied by which side picked a strike at all).
      const side: "bull" | "bear" = bullStrike !== null ? "bull" : "bear";
      const center = side === "bull" ? (bullStrike as number) : (bearStrike as number);
      const room = day0MaxPain !== null
        ? Math.abs(day0MaxPain - center)
        : 0;
      notActionableReason =
        `TP room ${fmtUsd(room)} from ${side} zone $${center.toLocaleString()} to max pain ${fmtUsd(day0MaxPain ?? 0)} — need ${fmtUsd(minTpRoomUsd)} (${MAX_PAIN_GAP_HALFWIDTHS}× halfWidth)`;
    }
  }

  // ── Build the response ───────────────────────────────────────────────
  const expiriesUsed = sortedExpiries.map(([label]) => label);

  return {
    bullStrike, bullZoneLow, bullZoneHigh, bullExitAbove,
    bearStrike, bearZoneLow, bearZoneHigh, bearExitBelow,

    maxPain:         day0MaxPain,
    maxPainByExpiry,
    signalConflict,

    bullTpTarget, bullTpExpiry, bullTpConfidence,
    bearTpTarget, bearTpExpiry, bearTpConfidence,

    bullActionable,
    bearActionable,
    notActionableReason,

    atmIV,
    ivBackwardation,
    inPanicRegime,
    halfWidthUsd:    sizes.halfWidthUsd,
    maxReachUsd:     sizes.maxReachUsd,
    minPinGapUsd:    sizes.minPinGapUsd,
    bullClusterShare,
    bearClusterShare,

    expiryUsed:   day0?.expiry ?? null,
    expiriesUsed,
    expiryOI:     day0?.totalOI ?? null,
    bullOI,
    bearOI,
    insufficientGap,
    maxPainAnchorSpanUsd,
    bullLocked: stickyMeta.bullLocked,
    bearLocked: stickyMeta.bearLocked,
    btcPrice:     currentPrice,
    deribitIndexPrice,
    computedAt:   new Date().toISOString(),
  };
}

