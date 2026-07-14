/**
 * Deribit-based zone suggester — "highest cluster + IV-derived sizing".
 *
 * Support / resistance walls match the NSE index chart rule (NIFTY etc.):
 *   • support  = highest put-wall OI below spot
 *   • resistance = highest call-wall OI above spot
 * No distance cutoff — earlier IV / max-pain windows failed too often by
 * excluding the real wall. Not "closest big cluster".
 *
 * Rewritten 2026-05-19 (urgency → closest-big). 2026-07-14 aligned cluster
 * picks with the FnoNinja highest-below / highest-above-spot rule.
 *
 * Near-term presence: strike must clear an absolute OI floor inside the
 * next 7 calendar days of expiries (not just the next 2 thin dailies).
 * Live Deribit data: far lottery strikes stay ~0 there; real walls pass.
 *
 * Strike↔max-pain gap and TP-room minimum are both 2 × halfWidth
 * (auto-tuned to IV via halfWidth). TP / magnet still uses TODAY's
 * (day-0) max pain only — unchanged.
 *
 *   1. Fetch all options for the asset from Deribit (single REST call —
 *      returns OI + IV + underlying price for every instrument).
 *
 *   2. Compute ATM IV from the nearest un-expired expiry. This drives
 *      band sizing (half-width) and panic detection — not cluster distance.
 *
 *   3. Sizes (all from ATM IV via the Black-Scholes σ formula):
 *        reach     = 1-σ over 1 day       = spot × IV × √(1/365)
 *        halfWidth = 1-σ over 4 hours     = spot × IV × √(4/8760)
 *           — floored at 2σ × 15 min (so the confirmation gate has room)
 *           — capped  at 2% × spot (so SL distance ≤ 3%, the engine's limit)
 *
 *   4. Aggregate OI per strike — all-expiry for ranking, day-0+1 for
 *      the premium-magnet sanity filter. Cluster potency uses **net wall
 *      OI at each strike** (puts − calls for support, calls − puts for
 *      resistance) so a strike with equal put/call OI does not rank as
 *      a major wall.
 *
 *   5. Pick the **highest** net-wall cluster on each side of spot
 *      (same rule as index-options-zones / NIFTY chart):
 *        bull (puts):  strike < spot, band reachable from spot, ≥ minClusterOi
 *        bear (calls): strike > spot, band reachable from spot, ≥ minClusterOi
 *      Sticky: while spot stays inside a published band, keep that band.
 *
 *   6. Today's max pain (day-0 only) is the magnet. Directional gate:
 *        bullActionable: maxPain > spot + MIN_PIN_GAP
 *        bearActionable: maxPain < spot - MIN_PIN_GAP
 *      where MIN_PIN_GAP = 0.5 × halfWidth. If the pin is too close to
 *      spot, neither side is actionable (chop regime).
 *
 *   7. TP target = day-0 max pain, subject to room check:
 *        bull: maxPain ≥ bullStrike + 2 × halfWidth
 *        bear: maxPain ≤ bearStrike − 2 × halfWidth
 *
 *   8. Panic regime check: ATM IV ≥ 70% (absolute) OR front IV >
 *      1.1× week-out IV (term-structure inversion). Suppresses fresh
 *      entries via `inPanicRegime` — open trades unaffected.
 *
 *   9. (Removed) day-0 vs day-1 max-pain "signal conflict" no longer
 *      blocks entries — with tallest-cluster S/R, multi-day pins often
 *      sit close / straddle spot without meaning the wall setup is bad.
 *
 *  10. Half-width has a strike-grid floor too: never narrower than half
 *      the spacing between adjacent listed strikes (so the band can't
 *      sit between two strikes without touching either).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Multi-asset design
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Identical algorithm for BTC / ETH / SOL / XRP on Deribit. Only
 * ASSET_SPEC rows differ (currency bucket, strike grid, minClusterOi).
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

/** When both picked clusters' net wall OI at their strikes differ by less
 *  than this fraction of the larger net, spot sits between nearly equal
 *  magnets and neither side has edge. Net = puts − calls at each strike. */
export const MIN_CLUSTER_OI_IMBALANCE = 0.35;

/** Legacy IV reach multiple — only used by `deriveMaxPainAnchorSpan` /
 *  `deriveClusterSearchRadius` for API field compat. Cluster picks no
 *  longer apply a distance window. */
const CLUSTER_SEARCH_REACH_MULT = 2.5;
const MAX_PAIN_ANCHOR_REACH_MULT = CLUSTER_SEARCH_REACH_MULT;

/** Absolute near-term OI floor = this fraction × per-asset `minClusterOi`
 *  (floored at 10). Not "5% of that strike's all-expiry OI" — live Deribit
 *  data (2026-07-14) shows most candidate strikes have 0% near-term OI;
 *  ghosts are literally ~0 contracts in the near window, while live walls
 *  clear tens–thousands. This absolute bar just rejects the zeros. */
const NEAR_TERM_OI_FLOOR_FRAC_OF_MIN_CLUSTER = 0.05;

/** Near-term presence window (calendar days). Live check 2026-07-14: using
 *  only the next 2 expiries fails on Deribit because those are often thin
 *  dailies (BTC 15JUL+16JUL ≈ 1.9k OI) while the real weekly sits at day ~3
 *  (17JUL ≈ 19k OI). Far lottery walls ($80k/$100k/$3200) still show ~0 OI
 *  inside 7d, so ghosts stay rejected while real walls pass. */
const NEAR_TERM_WINDOW_DAYS = 7;

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

/** Half-width cap = 2% of spot. Beyond this, SL one HW below the band can
 *  exceed `zone-bot-engine.MAX_SL_DISTANCE_PCT` for entries at band top.
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

/** 0..1 — how much two net wall OI values differ (1 = one-sided). */
export function clusterOiImbalanceRatio(
  bullNetOI: number | null | undefined,
  bearNetOI: number | null | undefined,
): number | null {
  if (
    bullNetOI == null ||
    bearNetOI == null ||
    !Number.isFinite(bullNetOI) ||
    !Number.isFinite(bearNetOI) ||
    bullNetOI <= 0 ||
    bearNetOI <= 0
  ) {
    return null;
  }
  const max = Math.max(bullNetOI, bearNetOI);
  return (max - Math.min(bullNetOI, bearNetOI)) / max;
}

/** Both sides picked but net wall OI too close — chop between equal magnets. */
export function clustersTooBalanced(
  bullNetOI: number | null | undefined,
  bearNetOI: number | null | undefined,
  minImbalance = MIN_CLUSTER_OI_IMBALANCE,
): boolean {
  const ratio = clusterOiImbalanceRatio(bullNetOI, bearNetOI);
  return ratio != null && ratio < minImbalance;
}

/** Signed net OI at a strike: put OI − call OI (positive = put-heavy). */
export function signedNetOiAtStrike(putOI: number, callOI: number): number {
  const put = Math.max(0, putOI);
  const call = Math.max(0, callOI);
  return put - call;
}

/** Directional wall strength at a strike after netting the opposite side.
 *  Never negative — call-heavy strikes score 0 for bull (put) walls and vice versa. */
export function netWallOiAtStrike(
  side: "put" | "call",
  putOI: number,
  callOI: number,
): number {
  const net = signedNetOiAtStrike(putOI, callOI);
  if (side === "put") return net > 0 ? net : 0;
  return net < 0 ? -net : 0;
}

function netWallOiFromMaps(
  side: "put" | "call",
  strike: number,
  putOIByStrike: Map<number, number>,
  callOIByStrike: Map<number, number>,
): number {
  const put = putOIByStrike.get(strike) ?? 0;
  const call = callOIByStrike.get(strike) ?? 0;
  return netWallOiAtStrike(side, put, call);
}

/** Sum of net wall OI across all strikes (for cluster share denominator). */
function totalNetWallOi(
  side: "put" | "call",
  putOIByStrike: Map<number, number>,
  callOIByStrike: Map<number, number>,
): number {
  const strikes = new Set([...putOIByStrike.keys(), ...callOIByStrike.keys()]);
  let total = 0;
  for (const strike of strikes) {
    total += netWallOiFromMaps(side, strike, putOIByStrike, callOIByStrike);
  }
  return total;
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
  /** Currency code passed to `get_book_summary_by_currency?currency=...`.
   *  BTC and ETH have their own dedicated inverse chains (BTC-margined,
   *  ETH-margined). SOL options on Deribit are USDC-margined and live
   *  inside the shared `USDC` bucket alongside BTC_USDC / ETH_USDC /
   *  TRX_USDC / XRP_USDC / AVAX_USDC, so SOL queries `USDC` and then
   *  filters by `instrumentPrefix` below. */
  deribitCurrency: string;
  /** Instrument-name prefix used to filter the fetched chain. Defaults
   *  to `${deribitCurrency}-` (BTC-..., ETH-...) so single-asset buckets
   *  need no special config. SOL sets this to `SOL_USDC-` because it
   *  shares the USDC bucket with other assets. */
  instrumentPrefix?: string;
  /** Approximate strike-grid spacing near ATM, in USD. Floors
   *  half-width so the band can't sit narrower than the gap between
   *  adjacent listed strikes. */
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
    // SOL options on Deribit are USDC-margined linear — name shape is
    // `SOL_USDC-23MAY26-87-C` and the chain is parked in the shared
    // USDC bucket. Querying `currency=SOL` returns zero (verified
    // 2026-05-22 — even `get_instruments?expired=true` is empty),
    // which was sending the suggester into the empty-result path.
    deribitCurrency:  "USDC",
    instrumentPrefix: "SOL_USDC-",
    // SOL_USDC trades on a $1 grid near ATM (e.g. $80/$81/$82/.../$91).
    // Far OTM widens to $2–$5; near ATM is where the wall-picker cares.
    strikeGridUsd:    1,
    yearDays:         365,
    indexEndpoint:    "sol_usdc",
    minClusterOi:     50,
  },
  xrp: {
    // XRP options are USDC-margined linear, name shape
    // `XRP_USDC-29MAY26-1d35-C` (the `d` is XRP's decimal-point
    // workaround because `.` collides with the field separator —
    // handled in parseInstrument). Strike grid is $0.02 near ATM
    // ($1.25 / $1.26 / $1.28 / $1.30 / $1.32 / …), widening to
    // $0.05–$0.10 far OTM. Spot ~$1.36 at time of wiring.
    //
    // Chain is THICK on the monthly weekly (29MAY: 63 strikes, 19.8M
    // OI) and the next monthly (26JUN: 44 strikes, 26.5M OI) but
    // lean on daily expiries (Sat/Sun: 4–6 strikes). The cluster
    // picker uses all-expiry OI so it benefits from the rich
    // weeklies even when day-0 is a thin daily.
    deribitCurrency:  "USDC",
    instrumentPrefix: "XRP_USDC-",
    strikeGridUsd:    0.02,
    yearDays:         365,
    indexEndpoint:    "xrp_usdc",
    // XRP carries huge per-strike OI (median ~200k) so a floor of
    // 2000 is well below the noise mark and lets thin-day pickers
    // still find a wall; the tallest-in-radius rule does the rest.
    minClusterOi:     2000,
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
  /** Always false — day-0/day-1 pin conflict no longer blocks entries. Kept for API compat. */
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
  /** Put vs call cluster OI dominance (0..1). null when only one side picked. */
  clusterOiImbalance:  number | null;
  /** Both clusters picked but OI nearly equal — neither side has edge. */
  clusterOiBalanced:   boolean;

  // ── Metadata ─────────────────────────────────────────────────────────────
  expiryUsed:        string | null;       // day-0 expiry label
  expiriesUsed:      string[];             // all expiry labels considered
  expiryOI:          number | null;        // day-0 expiry total OI
  bullOI:            number | null;        // all-expiry OI at chosen bull strike
  bearOI:            number | null;        // all-expiry OI at chosen bear strike
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
  // BTC-31JUL26-83000-C → 4 parts; ETH/SOL_USDC same shape.
  if (parts.length !== 4) return null;
  // Decimal-strike assets (XRP_USDC, TRX_USDC, etc.) encode the decimal
  // point as `d` because `.` would collide with the field separator:
  //   XRP_USDC-29MAY26-1d35-C  ⇒  $1.35 call.
  // Integer-strike assets (BTC, ETH, SOL_USDC) have no `d` to swap.
  const strikeRaw = parts[2].replace("d", ".");
  const strike = parseFloat(strikeRaw);
  if (!Number.isFinite(strike) || strike <= 0) return null;
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
  putOIByStrike:         Map<number, number>;
  callOIByStrike:        Map<number, number>;
  /** Near-term (≤7d expiry) OI per strike. Used only for the premium-magnet
   *  sanity filter — a strike whose near-term OI is below `nearTermOiFloor`
   *  is rejected regardless of its all-expiry total. */
  nearTermPutOI:         Map<number, number>;
  nearTermCallOI:        Map<number, number>;
  nearTermOiFloor:       number;
  spot:                  number;
  side:                  "put" | "call";
  zoneHalfWidthUsd:      number;
  minClusterOi:          number;
}

/** @deprecated Compat only — cluster picks no longer use a distance window. */
export function deriveClusterSearchRadius(maxReachUsd: number): number {
  return maxReachUsd * CLUSTER_SEARCH_REACH_MULT;
}

/** @deprecated Compat only — cluster picks no longer use a distance window. */
export function deriveMaxPainAnchorSpan(
  maxReachUsd: number,
  maxPainToSpotGapUsd: number,
): number {
  return Math.max(
    maxReachUsd * MAX_PAIN_ANCHOR_REACH_MULT,
    maxPainToSpotGapUsd + maxReachUsd,
  );
}

/** Bull band eligible when spot is at or inside support (not entirely above spot). */
export function bullStrikeEligibleForSpot(
  strike: number,
  halfWidth: number,
  spot: number,
): boolean {
  return strike - halfWidth <= spot;
}

/** Bear band eligible when spot is at or inside resistance (not entirely below spot). */
export function bearStrikeEligibleForSpot(
  strike: number,
  halfWidth: number,
  spot: number,
): boolean {
  return strike + halfWidth >= spot;
}

/**
 * Candidates for highest-below / highest-above-spot (NIFTY-style).
 * No distance cutoff — every strike on the correct side of spot qualifies
 * if it clears minClusterOi + near-term floor.
 */
export function filterHighestClusterCandidates(
  input: ClusterPickInput,
): Array<[number, number]> {
  const {
    putOIByStrike,
    callOIByStrike,
    nearTermPutOI,
    nearTermCallOI,
    nearTermOiFloor,
    spot,
    side,
    zoneHalfWidthUsd,
    minClusterOi,
  } = input;
  const half = zoneHalfWidthUsd;

  const allStrikes = new Set([...putOIByStrike.keys(), ...callOIByStrike.keys()]);
  const pool: Array<[number, number]> = [];
  for (const strike of allStrikes) {
    const netWall = netWallOiFromMaps(side, strike, putOIByStrike, callOIByStrike);
    if (netWall < minClusterOi) continue;

    if (side === "put") {
      if (strike >= spot) continue;
      if (!bullStrikeEligibleForSpot(strike, half, spot)) continue;
    } else {
      if (strike <= spot) continue;
      if (!bearStrikeEligibleForSpot(strike, half, spot)) continue;
    }

    const nearTermPut = nearTermPutOI.get(strike) ?? 0;
    const nearTermCall = nearTermCallOI.get(strike) ?? 0;
    const nearTermNet = netWallOiAtStrike(side, nearTermPut, nearTermCall);
    if (nearTermNet < nearTermOiFloor) continue;

    pool.push([strike, netWall]);
  }

  return pool;
}

/** Highest net-wall cluster on the side of spot (ties keep first max). */
export function pickHighestClusterNearSpot(
  input: ClusterPickInput,
): ClusterPick | null {
  const { putOIByStrike, callOIByStrike, side } = input;
  const candidates = filterHighestClusterCandidates(input);
  if (!candidates.length) return null;

  const sideTotal = totalNetWallOi(side, putOIByStrike, callOIByStrike);
  const [chosenStrike, chosenOi] = candidates.reduce((best, cur) =>
    cur[1] > best[1] ? cur : best,
  );

  return {
    strike: chosenStrike,
    oi: chosenOi,
    shareOfSide: sideTotal > 0 ? chosenOi / sideTotal : 0,
  };
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
    clusterOiImbalance: null, clusterOiBalanced: false,
    expiryUsed: null, expiriesUsed: [], expiryOI: null,
    bullOI: null, bearOI: null,
    maxPainAnchorSpanUsd: deriveClusterSearchRadius(sizes.maxReachUsd),
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

  // For shared buckets (`currency=USDC` returns BTC_USDC + ETH_USDC +
  // SOL_USDC + ...), keep only this asset's instruments. Single-asset
  // buckets (BTC, ETH) fall through with their default `BTC-` / `ETH-`
  // prefix which already matches every instrument they return.
  const namePrefix = spec.instrumentPrefix ?? `${spec.deribitCurrency}-`;

  // Parse all un-expired instruments (within 7-day window for max-pain math;
  // OI aggregation will use everything).
  const allParsed: Parsed[] = [];
  for (const item of json.result ?? []) {
    if (item.open_interest <= 0) continue;
    if (!item.instrument_name.startsWith(namePrefix)) continue;
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

  // Signal conflict was retired 2026-07-14: day-0 vs day-1 max pain on
  // opposite sides of spot is common once we target the tallest walls,
  // and blocking on it skipped valid cluster trades. Field kept false
  // for Firestore/API compat.
  const signalConflict = false;

  // ── Panic regime ──────────────────────────────────────────────────────
  const inPanicRegime =
    atmIV >= PANIC_IV_THRESHOLD ||
    ivBackwardation >= BACKWARDATION_RATIO_THRESHOLD;

  // ── Aggregate OI per strike — all-expiry for ranking, near-term for
  //    the premium-magnet sanity filter (see header for rationale).
  // Near-term = expiries within NEAR_TERM_WINDOW_DAYS (not just day-0+1
  // dailies — those are often empty while the weekly holds the real wall).
  const nearTermCutoffMs = nowMs + NEAR_TERM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const nearTermExpiries = new Set<string>();
  for (const [label, items] of itemsByExpiry) {
    const expMs = items[0]?.expiryDate.getTime();
    if (expMs != null && expMs > nowMs && expMs <= nearTermCutoffMs) {
      nearTermExpiries.add(label);
    }
  }
  const putOIByStrike      = new Map<number, number>(); // all-expiry, drives ranking
  const callOIByStrike     = new Map<number, number>();
  const nearTermPutOI      = new Map<number, number>(); // ≤7d, gates against magnets
  const nearTermCallOI     = new Map<number, number>();
  for (const p of allParsed) {
    const allMap = p.type === "P" ? putOIByStrike : callOIByStrike;
    allMap.set(p.strike, (allMap.get(p.strike) ?? 0) + p.oi);
    if (nearTermExpiries.has(p.expiry)) {
      const ntMap = p.type === "P" ? nearTermPutOI : nearTermCallOI;
      ntMap.set(p.strike, (ntMap.get(p.strike) ?? 0) + p.oi);
    }
  }

  // Kept on the snapshot for UI/API compat; no longer gates cluster picks.
  const maxPainAnchorSpanUsd = deriveClusterSearchRadius(sizes.maxReachUsd);

  const nearTermOiFloor = Math.max(
    10,
    NEAR_TERM_OI_FLOOR_FRAC_OF_MIN_CLUSTER * spec.minClusterOi,
  );

  const pickInput = (side: "put" | "call"): ClusterPickInput => ({
    putOIByStrike,
    callOIByStrike,
    nearTermPutOI: nearTermPutOI,
    nearTermCallOI: nearTermCallOI,
    nearTermOiFloor,
    spot,
    side,
    zoneHalfWidthUsd: sizes.halfWidthUsd,
    minClusterOi: spec.minClusterOi,
  });

  const bullPick = pickHighestClusterNearSpot(pickInput("put"));
  const bearPick = pickHighestClusterNearSpot(pickInput("call"));

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
      netWallOiFromMaps(side, strike, putOIByStrike, callOIByStrike),
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

  const clusterOiImbalance = clusterOiImbalanceRatio(bullOI, bearOI);
  const clusterOiBalanced =
    bullStrike !== null &&
    bearStrike !== null &&
    bullOI != null &&
    bearOI != null &&
    bullOI > 0 &&
    bearOI > 0 &&
    clustersTooBalanced(bullOI, bearOI);

  // ── Actionable flags + reason ────────────────────────────────────────
  let notActionableReason: string | null = null;
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  let bullActionable =
    !inPanicRegime &&
    !clusterOiBalanced &&
    bullStrike !== null &&
    magnetPullsUp &&
    bullTpTarget !== null;

  let bearActionable =
    !inPanicRegime &&
    !clusterOiBalanced &&
    bearStrike !== null &&
    magnetPullsDown &&
    bearTpTarget !== null;

  if (!bullActionable && !bearActionable) {
    if (clusterOiBalanced) {
      const pct =
        clusterOiImbalance != null
          ? `${(clusterOiImbalance * 100).toFixed(0)}%`
          : "n/a";
      notActionableReason =
        `Balanced net OI clusters (net gap ${pct}, need ≥${(MIN_CLUSTER_OI_IMBALANCE * 100).toFixed(0)}%) — puts and calls net to similar walls at both strikes`;
    } else if (inPanicRegime) {
      notActionableReason = ivBackwardation >= BACKWARDATION_RATIO_THRESHOLD
        ? `Panic regime — IV term-structure inverted (front/week = ${ivBackwardation.toFixed(2)}x)`
        : `Panic regime — ATM IV ${fmtPct(atmIV)} ≥ ${fmtPct(PANIC_IV_THRESHOLD)}`;
    } else if (day0MaxPain !== null && Math.abs(day0MaxPain - spot) < sizes.minPinGapUsd) {
      notActionableReason = `Pin chop — spot ${fmtUsd(spot)} too close to max pain ${fmtUsd(day0MaxPain)} (gap < ${fmtUsd(sizes.minPinGapUsd)})`;
    } else if (bullStrike === null && bearStrike === null) {
      notActionableReason =
        `No high OI cluster below/above spot ${fmtUsd(spot)} (need ≥${spec.minClusterOi.toLocaleString()} net OI)`;
    } else if (bullStrike === null) {
      notActionableReason = `No high put cluster below spot ${fmtUsd(spot)}`;
    } else if (bearStrike === null) {
      notActionableReason = `No high call cluster above spot ${fmtUsd(spot)}`;
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
    clusterOiImbalance,
    clusterOiBalanced,

    expiryUsed:   day0?.expiry ?? null,
    expiriesUsed,
    expiryOI:     day0?.totalOI ?? null,
    bullOI,
    bearOI,
    maxPainAnchorSpanUsd,
    bullLocked: stickyMeta.bullLocked,
    bearLocked: stickyMeta.bearLocked,
    btcPrice:     currentPrice,
    deribitIndexPrice,
    computedAt:   new Date().toISOString(),
  };
}

