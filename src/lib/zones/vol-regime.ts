/**
 * Volatility-regime engine for NSE option levels (indices + F&O stocks).
 *
 * Pure + dependency-free so it runs identically on server (cron) and client
 * (badges), and is trivially unit-testable.
 *
 * Purpose: qualify "near / at support/resistance" setups with a volatility
 * read, the same way the crypto path uses `inPanicRegime`. It does NOT pick
 * zones — selection stays OI-based. It only labels the *conditions* around a
 * level so the UI (or a downstream gate) can warn on elevated-risk setups.
 *
 * Two completely different reasons option IV is high, kept separate:
 *   • EARNINGS — a scheduled result is near. Known, expected IV ramp + gap
 *     risk. Not "panic", but still elevated-risk for a mean-reversion entry.
 *   • ELEVATED — IV is high with no scheduled event = genuine stress/risk-off.
 *
 * Inputs are layered and optional so the engine degrades gracefully:
 *   • day 1: ATM IV + earnings window (calendar) → EARNINGS / CALM / UNKNOWN
 *   • later: IV percentile (self or cross-sectional), term-structure ratio,
 *     India VIX percentile → adds ELEVATED detection
 *
 * IV unit convention: percent points (e.g. NSE/Dhan report 24.5 = 24.5%).
 * Ratios/percentiles are unitless. Everything here stays in those units.
 */

export type VolRegimeFlag = "CALM" | "ELEVATED" | "EARNINGS" | "UNKNOWN";

export interface VolRegime {
  flag: VolRegimeFlag;
  /** ATM implied vol in percent points, or null when not computable. */
  atmIv: number | null;
  /** IV percentile 0–100 (self-history or cross-sectional), null if unknown. */
  ivPercentile: number | null;
  /** Near-expiry ATM IV ÷ next-expiry ATM IV; >1 = backwardation. Null if unknown. */
  termRatio: number | null;
  /** Calendar days until the next scheduled results, null if unknown/none. */
  daysToEarnings: number | null;
  /** Human-readable explanation for the flag. */
  reason: string;
}

export interface VolRegimeInputs {
  atmIv: number | null;
  illiquid?: boolean;
  ivPercentile?: number | null;
  termRatio?: number | null;
  vixPercentile?: number | null;
  daysToEarnings?: number | null;
}

export interface VolRegimeThresholds {
  /** IV percentile at/above which vol is "elevated". */
  ivPercentileHigh: number;
  /** Near/next ATM IV ratio at/above which term structure is "inverted". */
  termRatioHigh: number;
  /** India VIX percentile at/above which the whole market is "elevated". */
  vixPercentileHigh: number;
  /** Earnings within this many days flips the flag to EARNINGS. */
  earningsWindowDays: number;
}

export const DEFAULT_VOL_REGIME_THRESHOLDS: VolRegimeThresholds = {
  ivPercentileHigh: 80,
  termRatioHigh: 1.10,
  vixPercentileHigh: 80,
  earningsWindowDays: 7,
};

/** Lowest/highest IV (percent points) we treat as a sane ATM reading. */
const MIN_USABLE_IV = 0.5;
const MAX_USABLE_IV = 300;

export interface IvHalfWidthOptions {
  /**
   * Horizon (in days) for the 1-σ move. Pick it to roughly reproduce the old
   * flat band at *typical* IV, so calm names stay familiar and only unusual IV
   * moves the band: e.g. stocks ~0.33d ≈ 0.75% at 25% IV, indices ~1d ≈ 0.8%
   * at 15% VIX.
   */
  horizonDays?: number;
  /** Floor as a fraction of spot (default 0.4%). */
  minPct?: number;
  /** Cap as a fraction of spot (default 2%). */
  maxPct?: number;
  /** Flat fraction of spot used when ATM IV is unknown (cold start / illiquid). */
  fallbackPct?: number;
  /** Flat absolute fallback (points) — takes precedence over fallbackPct when set. */
  fallbackAbs?: number | null;
  /** Strike step — the band is floored to at least one step so it spans a strike. */
  strikeStep?: number | null;
}

/**
 * IV-scaled band half-width — the same Black-Scholes σ sizing the crypto path
 * uses (`spot × IV × √(t)`), adapted for positional NSE levels:
 *
 *   halfWidth = spot × (atmIv/100) × √(horizonDays/365)
 *
 * Clamped to [minPct, maxPct] × spot, then floored at one strike step. When ATM
 * IV is unknown it falls back to a flat band (`fallbackAbs` or `fallbackPct`),
 * preserving the legacy behaviour. Pure + unit-testable.
 */
export function ivScaledHalfWidth(
  spot: number,
  atmIv: number | null | undefined,
  opts: IvHalfWidthOptions = {},
): number {
  const {
    horizonDays = 1,
    minPct = 0.004,
    maxPct = 0.02,
    fallbackPct = 0.0075,
    fallbackAbs = null,
    strikeStep = null,
  } = opts;

  if (!Number.isFinite(spot) || spot <= 0) return 0;

  const iv = usableIv(atmIv);
  let hw: number;
  if (iv != null) {
    hw = spot * (iv / 100) * Math.sqrt(Math.max(horizonDays, 0) / 365);
    hw = Math.min(Math.max(hw, spot * minPct), spot * maxPct);
  } else {
    hw = fallbackAbs != null && Number.isFinite(fallbackAbs) && fallbackAbs > 0
      ? fallbackAbs
      : spot * fallbackPct;
  }

  if (strikeStep != null && Number.isFinite(strikeStep) && strikeStep > 0) {
    hw = Math.max(hw, strikeStep);
  }
  return Math.round(hw * 100) / 100;
}

function usableIv(iv: number | null | undefined): number | null {
  if (typeof iv !== "number" || !Number.isFinite(iv)) return null;
  if (iv < MIN_USABLE_IV || iv > MAX_USABLE_IV) return null;
  return iv;
}

/**
 * ATM implied vol = average of the usable call/put IVs across the `nStrikes`
 * strikes closest to spot. Averaging a few near-ATM strikes (not a single one)
 * smooths the single-strike noise NSE/Dhan readings carry. Returns null when
 * no usable IV exists near spot.
 */
export function computeAtmIv(
  ivByStrike: Map<number, { callIV?: number | null; putIV?: number | null }>,
  spot: number,
  nStrikes = 2,
): number | null {
  if (!Number.isFinite(spot) || spot <= 0 || ivByStrike.size === 0) return null;

  const perStrike: { dist: number; iv: number }[] = [];
  for (const [strike, legs] of ivByStrike) {
    if (!Number.isFinite(strike) || strike <= 0) continue;
    const call = usableIv(legs.callIV);
    const put = usableIv(legs.putIV);
    const legsUsable = [call, put].filter((v): v is number => v != null);
    if (!legsUsable.length) continue;
    const avg = legsUsable.reduce((s, v) => s + v, 0) / legsUsable.length;
    perStrike.push({ dist: Math.abs(strike - spot), iv: avg });
  }

  if (!perStrike.length) return null;

  perStrike.sort((a, b) => a.dist - b.dist);
  const chosen = perStrike.slice(0, Math.max(1, nStrikes));
  const atm = chosen.reduce((s, c) => s + c.iv, 0) / chosen.length;
  return Math.round(atm * 100) / 100;
}

/**
 * Percentile (0–100) of `current` within `history`: the fraction of historical
 * readings strictly below it. Robust to outliers (unlike IV rank, which keys
 * off the min/max). Needs a minimum sample to be meaningful.
 */
export function ivPercentile(
  history: readonly number[],
  current: number | null,
  minSamples = 20,
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  const clean = history.filter((v) => Number.isFinite(v));
  if (clean.length < minSamples) return null;
  const below = clean.filter((v) => v < current).length;
  return Math.round((below / clean.length) * 1000) / 10;
}

/**
 * Cross-sectional percentile (0–100) of `current` within today's `universe` of
 * peer ATM IVs. Same math as {@link ivPercentile} but the cohort is "all F&O
 * names right now" rather than this name's own history — the day-1 bootstrap
 * before enough self-history accrues.
 */
export function crossSectionalPercentile(
  universe: readonly number[],
  current: number | null,
  minPeers = 20,
): number | null {
  return ivPercentile(universe, current, minPeers);
}

/** Near-expiry ATM IV ÷ next-expiry ATM IV (term structure). >1 = backwardation. */
export function termStructureRatio(
  nearAtmIv: number | null,
  nextAtmIv: number | null,
): number | null {
  const near = usableIv(nearAtmIv);
  const next = usableIv(nextAtmIv);
  if (near == null || next == null || next <= 0) return null;
  return Math.round((near / next) * 1000) / 1000;
}

/** Days until earnings, or null. Negative (past) collapses to null. */
export function daysUntil(dateIso: string | null | undefined, now: number): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((t - now) / 86_400_000);
  return days >= 0 ? days : null;
}

const UNKNOWN_REGIME = (atmIv: number | null, reason: string): VolRegime => ({
  flag: "UNKNOWN",
  atmIv,
  ivPercentile: null,
  termRatio: null,
  daysToEarnings: null,
  reason,
});

/**
 * Classify the volatility regime around a level. Selection is unaffected — this
 * is a pure qualifier. Precedence: UNKNOWN (no/illiquid IV) → EARNINGS (event
 * pending, gap risk) → ELEVATED (high IV, no event) → CALM.
 */
export function classifyVolRegime(
  inputs: VolRegimeInputs,
  thresholds: VolRegimeThresholds = DEFAULT_VOL_REGIME_THRESHOLDS,
): VolRegime {
  const atmIv = usableIv(inputs.atmIv);

  if (inputs.illiquid || atmIv == null) {
    return UNKNOWN_REGIME(atmIv, inputs.illiquid ? "Illiquid chain — IV not reliable" : "No usable ATM IV");
  }

  const ivPct = typeof inputs.ivPercentile === "number" ? inputs.ivPercentile : null;
  const termRatio = typeof inputs.termRatio === "number" ? inputs.termRatio : null;
  const vixPct = typeof inputs.vixPercentile === "number" ? inputs.vixPercentile : null;
  const daysToEarnings =
    typeof inputs.daysToEarnings === "number" && inputs.daysToEarnings >= 0
      ? inputs.daysToEarnings
      : null;

  const elevatedReasons: string[] = [];
  if (ivPct != null && ivPct >= thresholds.ivPercentileHigh) {
    elevatedReasons.push(`IV percentile ${ivPct.toFixed(0)} ≥ ${thresholds.ivPercentileHigh}`);
  }
  if (termRatio != null && termRatio >= thresholds.termRatioHigh) {
    elevatedReasons.push(`term structure ${termRatio.toFixed(2)}× inverted`);
  }
  if (vixPct != null && vixPct >= thresholds.vixPercentileHigh) {
    elevatedReasons.push(`India VIX percentile ${vixPct.toFixed(0)} ≥ ${thresholds.vixPercentileHigh}`);
  }
  const isElevated = elevatedReasons.length > 0;

  const base = { atmIv, ivPercentile: ivPct, termRatio, daysToEarnings };

  // Earnings wins: a scheduled result means known event + gap risk regardless
  // of whether IV has ramped yet. Note co-incident elevation in the reason.
  if (daysToEarnings != null && daysToEarnings <= thresholds.earningsWindowDays) {
    const when = daysToEarnings === 0 ? "today" : `in ${daysToEarnings}d`;
    const extra = isElevated ? ` (IV elevated: ${elevatedReasons.join(", ")})` : "";
    return { ...base, flag: "EARNINGS", reason: `Earnings ${when} — gap risk${extra}` };
  }

  if (isElevated) {
    return { ...base, flag: "ELEVATED", reason: `Elevated vol — ${elevatedReasons.join(", ")}` };
  }

  return { ...base, flag: "CALM", reason: "Calm — IV in normal range, no event near" };
}
