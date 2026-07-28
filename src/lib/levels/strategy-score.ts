/**
 * Deterministic F&O setup / strategy scoring engine (Atlas AI).
 *
 * The scorer is intentionally LLM-independent, pure and dependency-light so it
 * runs identically on the server (Fynn route) and the client (SR-audit
 * calibration table), and is trivially unit-testable.
 *
 * Design — three ORTHOGONAL sub-scores, composed per strategy, never one flat
 * blend (that was the flaw in the original hand-written rule table):
 *
 *   1. Direction  ∈ [-1, +1]   bearish … bullish. A weighted, normalised blend
 *      of directional reads: spot vs support/resistance bands, max-pain pull
 *      (correct side + modest gap, saturating ~5% — not "farther forever"),
 *      day-over-day OI-wall buildup, news sentiment, and PVT slope (primary
 *      confirmation — largest direction weight after SR-audit calibration).
 *
 *   2. VolFit     ∈ [0, 1]      per volatility posture. Keyed off IV *percentile*
 *      / regime, NEVER absolute IV. Buying vol wants LOW IV (+ a catalyst);
 *      selling vol wants HIGH IV; a futures / directional posture is vega-neutral
 *      — IV does not raise its score, it only trims it for extreme-risk regimes.
 *
 *   3. Context    ∈ [0, 1]      quality gate: strike/level alignment to OI walls
 *      and bands, liquidity (OI cluster size) and reward:risk with a *soft peak*
 *      (reachable RR ~1.5–2.5 scores best; lottery RR is down-weighted — SR-audit
 *      showed win rate collapsing above ~2.5R).
 *
 * Composition:  composite = 100 · (wDir·align + wVol·volFit + wCtx·ctx) − penalties
 * where `align` maps the strategy's stance against the Direction read (a bullish
 * strategy only earns direction points when the read is bullish; a neutral /
 * volatility strategy wants a *flat* read). Weights + thresholds live in
 * {@link SCORE_CONFIG} so they can be calibrated against realised SR-audit
 * outcomes later without touching the logic.
 */

export type Stance = "bullish" | "bearish" | "neutral" | "volatility";

/**
 * Volatility posture of a structure — decides how IV should be scored:
 *  • long-vol   — net premium paid / net long options (debit spreads, long C/P)
 *  • short-vol  — net premium received (credit spreads, iron condor, short opts)
 *  • directional — a futures leg dominates (linear, ~vega-neutral)
 *  • neutral-vol — balanced / indeterminate
 */
export type VolPosture = "long-vol" | "short-vol" | "directional" | "neutral-vol";

export type DirectionLabel = "bullish" | "neutral" | "bearish";

/** Normalised inputs the scorer reasons over. Every field is optional/nullable
 *  so the engine degrades gracefully as data availability varies. */
export interface ScoreInputs {
  spot: number | null;
  maxPain: number | null;
  supportLow: number | null;
  supportHigh: number | null;
  resistanceLow: number | null;
  resistanceHigh: number | null;
  putWallStrike: number | null;
  putWallSize: number | null;
  callWallStrike: number | null;
  callWallSize: number | null;
  /** ATM implied vol, percent points. */
  atmIV: number | null;
  /** IV percentile 0–100 (self-history / cross-sectional). Preferred vol signal. */
  ivPercentile: number | null;
  /** CALM | ELEVATED | EARNINGS | UNKNOWN — fallback when ivPercentile is null. */
  volRegimeFlag: string | null;
  daysToExpiry: number | null;
  daysToEarnings: number | null;
  /** Day-over-day % change in put-wall OI (+ = support building = bullish). */
  putOiChangePct: number | null;
  /** Day-over-day % change in call-wall OI (+ = resistance building = bearish). */
  callOiChangePct: number | null;
  /** News sentiment 0–100 (50 = neutral). */
  newsScore: number | null;
  /** Optional normalised PVT slope, −1 … +1. */
  pvtSlope: number | null;
}

export interface DirectionBreakdown {
  /** Net directional read, −1 (bearish) … +1 (bullish). */
  value: number;
  label: DirectionLabel;
  /** Individual normalised contributions that were present (for explainability). */
  parts: { key: string; value: number; weight: number }[];
}

export interface SetupScore {
  /** 0–100 composite. */
  composite: number;
  /** Raw direction read −1…+1 (same for every strategy on a symbol). */
  direction: number;
  directionLabel: DirectionLabel;
  posture: VolPosture;
  /** 0–100 display sub-scores. `direction` here is stance-alignment, not the raw read. */
  subScores: { direction: number; volFit: number; context: number };
  reason: string;
}

export interface ScoreWeights {
  direction: number;
  volFit: number;
  context: number;
}

export interface ScoreConfig {
  weights: ScoreWeights;
  /** Direction sub-signal weights (renormalised over whichever are present). */
  directionWeights: {
    band: number;
    maxPainSign: number;
    oiBuildup: number;
    news: number;
    pvt: number;
  };
  /** Fractional gap (of spot) at which the max-pain sign contributes ±1. */
  maxPainFullGapPct: number;
  /** OI-buildup delta spread (put%−call%) that saturates the signal. */
  oiBuildupSaturationPct: number;
  /** IV percentile at/above which vol is "high", at/below which "low". */
  ivHighPct: number;
  ivLowPct: number;
  /**
   * Context RR soft-peak (audit-calibrated): rise from `rrRiseFrom` → 1 at
   * `rrPeakLow`, stay at 1 through `rrPeakHigh`, decay to `rrFloor` by
   * `rrDecayTo`, then hold the floor. Replaces the old linear `RR / 3` which
   * rewarded unreachable max-pain targets.
   */
  rrRiseFrom: number;
  rrPeakLow: number;
  rrPeakHigh: number;
  rrDecayTo: number;
  rrFloor: number;
  /** OI contracts that saturate the liquidity term. */
  liquiditySaturation: number;
  /** Earnings within this many days applies the gap-risk penalty. */
  earningsWindowDays: number;
  /** Short-dated threshold (days) for theta effects. */
  shortDatedDays: number;
  penalties: {
    earnings: number;
    illiquidRegime: number;
  };
}

export const SCORE_CONFIG: ScoreConfig = {
  // SR-audit v1: lean on direction (esp. PVT), keep vol quieter for directional
  // setups, and use context for liquidity + reachable RR.
  weights: { direction: 0.5, volFit: 0.2, context: 0.3 },
  directionWeights: { band: 0.2, maxPainSign: 0.15, oiBuildup: 0.15, news: 0.1, pvt: 0.4 },
  maxPainFullGapPct: 0.05,
  oiBuildupSaturationPct: 25,
  ivHighPct: 70,
  ivLowPct: 30,
  rrRiseFrom: 0.8,
  rrPeakLow: 1.5,
  rrPeakHigh: 2.5,
  rrDecayTo: 4,
  rrFloor: 0.25,
  liquiditySaturation: 1_000_000,
  earningsWindowDays: 7,
  shortDatedDays: 7,
  penalties: { earnings: 0.1, illiquidRegime: 0.05 },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const tanh = (x: number): number => Math.tanh(x);
const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function mid(lo: number | null, hi: number | null): number | null {
  if (isNum(lo) && isNum(hi)) return (lo + hi) / 2;
  if (isNum(lo)) return lo;
  if (isNum(hi)) return hi;
  return null;
}

/** 0 = very high IV posture … 1 conceptually "low"; here we return the HIGH-ness
 *  of IV in [0,1] (1 = very high). Prefers percentile, falls back to regime. */
function ivHighness(inputs: ScoreInputs): number | null {
  if (isNum(inputs.ivPercentile)) return clamp01(inputs.ivPercentile / 100);
  switch ((inputs.volRegimeFlag ?? "").toUpperCase()) {
    case "ELEVATED":
      return 0.85;
    case "EARNINGS":
      return 0.75;
    case "CALM":
      return 0.3;
    default:
      return null; // UNKNOWN / missing
  }
}

function directionLabel(value: number): DirectionLabel {
  if (value >= 0.15) return "bullish";
  if (value <= -0.15) return "bearish";
  return "neutral";
}

/**
 * Net directional read from the symbol's positioning data, −1 … +1.
 * Bullish is positive. Only the signals that are derivable contribute, with the
 * weight set renormalised over those present.
 */
export function computeDirection(
  inputs: ScoreInputs,
  cfg: ScoreConfig = SCORE_CONFIG,
): DirectionBreakdown {
  const parts: { key: string; value: number; weight: number }[] = [];
  const dw = cfg.directionWeights;

  // 1. Spot vs bands — +1 at/below support (floor), −1 at/above resistance (cap).
  const sMid = mid(inputs.supportLow, inputs.supportHigh);
  const rMid = mid(inputs.resistanceLow, inputs.resistanceHigh);
  if (isNum(inputs.spot) && isNum(sMid) && isNum(rMid) && rMid !== sMid) {
    const pos = (inputs.spot - sMid) / (rMid - sMid); // 0 at support … 1 at resistance
    parts.push({ key: "band", value: clamp(1 - 2 * pos, -1, 1), weight: dw.band });
  }

  // 2. Max-pain pull — correct side + modest distance (saturates at
  //    maxPainFullGapPct ≈ 5%). Farther than that does not keep adding juice;
  //    reachable targets are scored in Context via the RR soft-peak.
  if (isNum(inputs.spot) && isNum(inputs.maxPain) && inputs.spot > 0) {
    const gap = (inputs.maxPain - inputs.spot) / inputs.spot;
    parts.push({
      key: "maxPainSign",
      value: clamp(gap / cfg.maxPainFullGapPct, -1, 1),
      weight: dw.maxPainSign,
    });
  }

  // 3. OI buildup — put wall building = support strengthening (bullish);
  //    call wall building = resistance strengthening (bearish).
  if (isNum(inputs.putOiChangePct) || isNum(inputs.callOiChangePct)) {
    const put = isNum(inputs.putOiChangePct) ? inputs.putOiChangePct : 0;
    const call = isNum(inputs.callOiChangePct) ? inputs.callOiChangePct : 0;
    parts.push({
      key: "oiBuildup",
      value: tanh((put - call) / cfg.oiBuildupSaturationPct),
      weight: dw.oiBuildup,
    });
  }

  // 4. News sentiment.
  if (isNum(inputs.newsScore)) {
    parts.push({ key: "news", value: clamp((inputs.newsScore - 50) / 50, -1, 1), weight: dw.news });
  }

  // 5. PVT slope (already normalised).
  if (isNum(inputs.pvtSlope)) {
    parts.push({ key: "pvt", value: clamp(inputs.pvtSlope, -1, 1), weight: dw.pvt });
  }

  const wSum = parts.reduce((s, p) => s + p.weight, 0);
  const value = wSum > 0 ? parts.reduce((s, p) => s + p.value * p.weight, 0) / wSum : 0;
  return { value: clamp(value, -1, 1), label: directionLabel(value), parts };
}

/**
 * How well a strategy's stance agrees with the directional read → [0,1].
 * Bullish wants a high read, bearish a low read; neutral / volatility want a
 * FLAT read (range-bound), so they are rewarded when |direction| is small.
 */
export function stanceAlignment(stance: Stance, direction: number): number {
  switch (stance) {
    case "bullish":
      return clamp01((direction + 1) / 2);
    case "bearish":
      return clamp01((1 - direction) / 2);
    default: // neutral | volatility → range-bound
      return clamp01(1 - Math.abs(direction));
  }
}

/** Volatility fit for a posture given the IV regime → [0,1]. */
export function computeVolFit(
  posture: VolPosture,
  inputs: ScoreInputs,
  cfg: ScoreConfig = SCORE_CONFIG,
): number {
  const high = ivHighness(inputs); // null when unknown
  const ivH = high ?? 0.5; // neutral fallback
  const earningsNear =
    isNum(inputs.daysToEarnings) && inputs.daysToEarnings <= cfg.earningsWindowDays;
  const shortDated = isNum(inputs.daysToExpiry) && inputs.daysToExpiry < cfg.shortDatedDays;

  switch (posture) {
    case "long-vol": {
      // Buying is best when options are CHEAP (low IV). A near catalyst raises
      // the odds realised > implied; short-dated theta decay hurts buyers.
      let v = 1 - ivH;
      if (earningsNear) v += 0.15;
      if (shortDated) v -= 0.2;
      return clamp01(v);
    }
    case "short-vol": {
      // Selling is best when options are RICH (high IV). Theta helps sellers as
      // expiry nears; an imminent event is gap / crush risk.
      let v = ivH;
      if (shortDated) v += 0.1;
      if (earningsNear) v -= 0.2;
      return clamp01(v);
    }
    default: {
      // Directional / neutral-vol (e.g. hedged futures) — vega-neutral. Do NOT
      // reward high IV; only trim for extreme-risk regimes so IV can't flip the
      // ranking of a directional idea.
      let v = 0.55;
      if (ivH > 0.8) v -= (ivH - 0.8) * 1.0; // up to −0.2 at ivH=1
      return clamp01(v);
    }
  }
}

const near = (x: number, target: number, tol: number): boolean => Math.abs(x - target) <= tol;

/**
 * Context RR soft-peak ∈ [rrFloor, 1].
 *   RR < riseFrom          → 0
 *   riseFrom → peakLow     → 0 → 1
 *   peakLow → peakHigh     → 1
 *   peakHigh → decayTo     → 1 → rrFloor
 *   RR > decayTo           → rrFloor
 */
export function rrContextScore(rr: number, cfg: ScoreConfig = SCORE_CONFIG): number {
  if (!Number.isFinite(rr) || rr <= 0) return 0;
  const { rrRiseFrom: a, rrPeakLow: b, rrPeakHigh: c, rrDecayTo: d, rrFloor: floor } = cfg;
  if (rr < a) return 0;
  if (rr < b) return clamp01((rr - a) / (b - a));
  if (rr <= c) return 1;
  if (rr < d) return clamp(1 - ((rr - c) / (d - c)) * (1 - floor), floor, 1);
  return floor;
}

/**
 * Context / quality sub-score → [0,1]: average of whichever parts are derivable
 * — strike-to-level alignment, OI-cluster liquidity and reward:risk (soft-peak).
 */
export function computeContext(
  inputs: ScoreInputs,
  opts: { strikes?: number[]; riskReward?: number | null; activeSide?: "support" | "resistance" | null } = {},
  cfg: ScoreConfig = SCORE_CONFIG,
): number {
  const parts: number[] = [];

  // Level alignment — do the structure's strikes sit on walls / bands / max pain?
  const anchors = [
    inputs.putWallStrike,
    inputs.callWallStrike,
    inputs.supportLow,
    inputs.supportHigh,
    inputs.resistanceLow,
    inputs.resistanceHigh,
    inputs.maxPain,
  ].filter(isNum);
  if (opts.strikes && opts.strikes.length && anchors.length && isNum(inputs.spot)) {
    const tol = Math.max(inputs.spot * 0.01, 1); // ~1% of spot
    const aligned = opts.strikes.filter((k) => anchors.some((a) => near(k, a, tol))).length;
    parts.push(clamp01(aligned / opts.strikes.length));
  }

  // Liquidity — OI at the relevant cluster (log-saturating; sizes span decades).
  const size =
    opts.activeSide === "support"
      ? inputs.putWallSize
      : opts.activeSide === "resistance"
        ? inputs.callWallSize
        : Math.max(inputs.putWallSize ?? 0, inputs.callWallSize ?? 0) || null;
  if (isNum(size) && size > 0) {
    parts.push(clamp01(Math.log10(size) / Math.log10(cfg.liquiditySaturation)));
  }

  // Reward:risk — soft-peak (reachable targets beat lottery RR).
  if (isNum(opts.riskReward) && opts.riskReward > 0) {
    parts.push(rrContextScore(opts.riskReward, cfg));
  }

  if (!parts.length) return 0.5; // neutral when nothing is derivable
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

/** Derive a volatility posture from option/future legs (+ optional econ kind). */
export function postureFromLegs(
  legs: { instrument: "option" | "future"; action: "buy" | "sell" }[],
  econKind?: "debit" | "credit" | "flat" | null,
): VolPosture {
  if (legs.some((l) => l.instrument === "future")) return "directional";
  if (econKind === "debit") return "long-vol";
  if (econKind === "credit") return "short-vol";
  const opts = legs.filter((l) => l.instrument === "option");
  const bought = opts.filter((l) => l.action === "buy").length;
  const sold = opts.filter((l) => l.action === "sell").length;
  if (bought > sold) return "long-vol";
  if (sold > bought) return "short-vol";
  return "neutral-vol";
}

function penaltyFor(inputs: ScoreInputs, cfg: ScoreConfig): number {
  let p = 0;
  if (isNum(inputs.daysToEarnings) && inputs.daysToEarnings <= cfg.earningsWindowDays) {
    p += cfg.penalties.earnings;
  }
  if ((inputs.volRegimeFlag ?? "").toUpperCase() === "UNKNOWN" || inputs.volRegimeFlag == null) {
    p += cfg.penalties.illiquidRegime;
  }
  return p;
}

function buildReason(
  stance: Stance,
  dir: DirectionBreakdown,
  posture: VolPosture,
  volFit: number,
): string {
  const dirTxt =
    dir.label === "bullish"
      ? "bullish read"
      : dir.label === "bearish"
        ? "bearish read"
        : "range-bound read";
  const fitTxt =
    posture === "long-vol"
      ? volFit >= 0.6
        ? "IV is cheap — favourable for buying premium"
        : "IV is not cheap for buying premium"
      : posture === "short-vol"
        ? volFit >= 0.6
          ? "IV is rich — favourable for selling premium"
          : "IV is thin for selling premium"
        : "vega-neutral (futures-led)";
  const fitStance =
    (stance === "bullish" && dir.label === "bullish") ||
    (stance === "bearish" && dir.label === "bearish") ||
    ((stance === "neutral" || stance === "volatility") && dir.label === "neutral")
      ? "aligned with"
      : "against";
  return `${stance} structure ${fitStance} the ${dirTxt}; ${fitTxt}.`;
}

export interface ScoreStrategyArgs {
  stance: Stance;
  posture: VolPosture;
  inputs: ScoreInputs;
  strikes?: number[];
  riskReward?: number | null;
  cfg?: ScoreConfig;
  /** Pre-computed direction (avoids recomputing per strategy on one symbol). */
  direction?: DirectionBreakdown;
}

/** Score a single strategy against the symbol's inputs. */
export function scoreStrategy(args: ScoreStrategyArgs): SetupScore {
  const cfg = args.cfg ?? SCORE_CONFIG;
  const dir = args.direction ?? computeDirection(args.inputs, cfg);
  const align = stanceAlignment(args.stance, dir.value);
  const volFit = computeVolFit(args.posture, args.inputs, cfg);
  const activeSide: "support" | "resistance" | null =
    args.stance === "bullish" ? "support" : args.stance === "bearish" ? "resistance" : null;
  const context = computeContext(
    args.inputs,
    { strikes: args.strikes, riskReward: args.riskReward, activeSide },
    cfg,
  );

  const { weights } = cfg;
  const wSum = weights.direction + weights.volFit + weights.context;
  const raw =
    (weights.direction * align + weights.volFit * volFit + weights.context * context) / wSum;
  const composite = clamp(Math.round((raw - penaltyFor(args.inputs, cfg)) * 100), 0, 100);

  return {
    composite,
    direction: dir.value,
    directionLabel: dir.label,
    posture: args.posture,
    subScores: {
      direction: Math.round(align * 100),
      volFit: Math.round(volFit * 100),
      context: Math.round(context * 100),
    },
    reason: buildReason(args.stance, dir, args.posture, volFit),
  };
}

/**
 * Score a directional zone setup (SR-audit calibration + toolbar badge). A
 * support entry is a bullish setup, a resistance entry bearish; the posture is
 * treated as directional (vega-neutral) since it's a level thesis, not a vol trade.
 */
export function scoreDirectionalSetup(
  side: "support" | "resistance",
  inputs: ScoreInputs,
  opts: { riskReward?: number | null; cfg?: ScoreConfig } = {},
): SetupScore {
  const stance: Stance = side === "support" ? "bullish" : "bearish";
  return scoreStrategy({
    stance,
    posture: "directional",
    inputs,
    riskReward: opts.riskReward ?? null,
    cfg: opts.cfg,
  });
}
