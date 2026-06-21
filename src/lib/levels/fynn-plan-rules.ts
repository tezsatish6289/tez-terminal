/**
 * Deterministic Fynn plan builder — fallback when AI output fails validation.
 * Uses the same zone / IV inputs as the chart; no LLM.
 */

import type { FynnContext, FynnPlan } from "@/ai/flows/fynn-strategy-flow";
import {
  strategyKind,
  strikeStepFor,
  validateFynnPlan,
} from "@/lib/levels/fynn-plan-validate";

type StrategyLeg = FynnPlan["strategies"][number]["legs"][number];
type Strategy = FynnPlan["strategies"][number];

function fmtLevel(ctx: FynnContext, n: number | null): string | null {
  if (n == null) return null;
  const v = n >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toLocaleString("en-IN");
  return `${ctx.currency}${v}`;
}

function fmtBand(ctx: FynnContext, lo: number | null, hi: number | null): string | null {
  if (lo == null && hi == null) return null;
  return `${fmtLevel(ctx, lo) ?? "?"} – ${fmtLevel(ctx, hi) ?? "?"}`;
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function isCalmIv(ctx: FynnContext): boolean {
  const flag = ctx.volRegime?.toUpperCase();
  return flag === "CALM" || flag === "UNKNOWN" || flag == null;
}

function deriveBias(ctx: FynnContext): FynnPlan["bias"] {
  const { spot, supportLow, supportHigh, resistanceLow, resistanceHigh, maxPain } = ctx;
  if (spot == null) return "neutral";

  const inSupport =
    supportLow != null &&
    supportHigh != null &&
    spot >= Math.min(supportLow, supportHigh) &&
    spot <= Math.max(supportLow, supportHigh);
  const inResistance =
    resistanceLow != null &&
    resistanceHigh != null &&
    spot >= Math.min(resistanceLow, resistanceHigh) &&
    spot <= Math.max(resistanceLow, resistanceHigh);

  if (inSupport) return maxPain != null && spot < maxPain ? "lean-bullish" : "bullish";
  if (inResistance) return maxPain != null && spot > maxPain ? "lean-bearish" : "bearish";

  if (maxPain != null) {
    const distPct = (spot - maxPain) / spot;
    if (distPct > 0.04) return "lean-bearish";
    if (distPct < -0.04) return "lean-bullish";
  }
  return "neutral";
}

function expiryLabel(ctx: FynnContext): string {
  return ctx.expiry ? `${ctx.expiry} expiry` : "current expiry";
}

function structureLine(ctx: FynnContext, legs: StrategyLeg[]): string {
  const legStr = legs
    .map((l) => {
      const verb = l.action === "buy" ? "Buy" : "Sell";
      if (l.instrument === "future") return `${verb} Futures`;
      return `${verb} ${fmtLevel(ctx, l.strike ?? 0)} ${l.optionType}`;
    })
    .join(" / ");
  return `${legStr}, ${expiryLabel(ctx)}`;
}

function optLeg(action: "buy" | "sell", optionType: "CE" | "PE", strike: number): StrategyLeg {
  return { instrument: "option", action, optionType, strike };
}

function futLeg(action: "buy" | "sell"): StrategyLeg {
  return { instrument: "future", action, optionType: null, strike: null };
}

function buildBullCallSpread(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  const buyStrike = snap(ctx.putWallStrike ?? ctx.supportLow ?? spot - step, step);
  let sellStrike = snap(ctx.callWallStrike ?? ctx.resistanceLow ?? buyStrike + step, step);
  if (sellStrike <= buyStrike) sellStrike = buyStrike + step;

  const legs: StrategyLeg[] = [
    optLeg("buy", "CE", buyStrike),
    optLeg("sell", "CE", sellStrike),
  ];

  return {
    name: "Bull Call Spread",
    stance: "bullish",
    whyNow: `Spot at ${fmtLevel(ctx, spot)} is holding above support${ctx.putWallStrike ? ` and the put OI wall at ${fmtLevel(ctx, ctx.putWallStrike)}` : ""}. A debit call spread expresses a defined-risk bullish view toward resistance.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: "Net debit paid (limited to premium)",
    maxReward: "Spread width minus net debit",
    invalidation: `Close below ${fmtLevel(ctx, ctx.supportLow ?? buyStrike - step)}`,
  };
}

function buildBearPutSpread(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  let buyStrike = snap(ctx.callWallStrike ?? ctx.resistanceLow ?? spot, step);
  let sellStrike = snap(ctx.putWallStrike ?? ctx.supportHigh ?? buyStrike - step, step);
  if (buyStrike <= sellStrike) buyStrike = sellStrike + step;

  const legs: StrategyLeg[] = [
    optLeg("buy", "PE", buyStrike),
    optLeg("sell", "PE", sellStrike),
  ];

  return {
    name: "Bear Put Spread",
    stance: "bearish",
    whyNow: `Spot at ${fmtLevel(ctx, spot)} faces resistance${ctx.callWallStrike ? ` near the call OI wall at ${fmtLevel(ctx, ctx.callWallStrike)}` : ""}. A debit put spread targets a move lower with capped risk.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: "Net debit paid (limited to premium)",
    maxReward: "Spread width minus net debit",
    invalidation: `Sustained close above ${fmtLevel(ctx, ctx.resistanceHigh ?? buyStrike + step)}`,
  };
}

function buildBullPutSpread(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  const sellStrike = snap(ctx.putWallStrike ?? ctx.supportHigh ?? spot - step, step);
  const buyStrike = sellStrike - step;
  if (buyStrike <= 0) return null;

  const legs: StrategyLeg[] = [
    optLeg("sell", "PE", sellStrike),
    optLeg("buy", "PE", buyStrike),
  ];

  return {
    name: "Bull Put Spread",
    stance: "bullish",
    whyNow: `Elevated IV and support${ctx.putWallStrike ? ` at the put OI wall (${fmtLevel(ctx, ctx.putWallStrike)})` : ""} favour collecting premium below spot with a defined-risk credit spread.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: "Spread width minus net credit",
    maxReward: "Net credit received",
    invalidation: `Close below ${fmtLevel(ctx, ctx.supportLow ?? buyStrike - step)}`,
  };
}

function buildBearCallSpread(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  const sellStrike = snap(ctx.callWallStrike ?? ctx.resistanceLow ?? spot + step, step);
  const buyStrike = sellStrike + step;

  const legs: StrategyLeg[] = [
    optLeg("sell", "CE", sellStrike),
    optLeg("buy", "CE", buyStrike),
  ];

  return {
    name: "Bear Call Spread",
    stance: "bearish",
    whyNow: `Spot at ${fmtLevel(ctx, spot)} sits under resistance${ctx.callWallStrike ? ` and the call OI wall at ${fmtLevel(ctx, ctx.callWallStrike)}` : ""}. A credit call spread harvests premium if the ceiling holds.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: "Spread width minus net credit",
    maxReward: "Net credit received",
    invalidation: `Sustained close above ${fmtLevel(ctx, ctx.resistanceHigh ?? buyStrike + step)}`,
  };
}

function buildIronCondor(ctx: FynnContext, step: number): Strategy | null {
  const bullPut = buildBullPutSpread(ctx, step);
  const bearCall = buildBearCallSpread(ctx, step);
  if (!bullPut || !bearCall) return null;

  const legs = [...bullPut.legs, ...bearCall.legs];
  return {
    name: "Iron Condor",
    stance: "neutral",
    whyNow: `Spot is range-bound between the put wall (${fmtLevel(ctx, ctx.putWallStrike)}) and call wall (${fmtLevel(ctx, ctx.callWallStrike)}). Elevated IV supports a defined-risk premium collection play.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: "Wider spread width minus total credit",
    maxReward: "Total net credit received",
    invalidation: `Break below ${fmtLevel(ctx, ctx.supportLow)} or above ${fmtLevel(ctx, ctx.resistanceHigh)}`,
  };
}

function buildHedgedLongFuture(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  // Protective put at/below support or the put wall — the hedge that caps loss.
  const putStrike = snap(ctx.putWallStrike ?? ctx.supportLow ?? spot - 2 * step, step);
  if (putStrike <= 0) return null;
  const legs: StrategyLeg[] = [futLeg("buy"), optLeg("buy", "PE", putStrike)];
  return {
    name: "Hedged Long Futures (Protective Put)",
    stance: "bullish",
    whyNow: `If price holds above support${ctx.putWallStrike ? ` and the put OI wall at ${fmtLevel(ctx, ctx.putWallStrike)}` : ""}, that's a bullish read. A long future paired with a protective ${fmtLevel(ctx, putStrike)} put caps the downside if the floor breaks.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: `Defined: futures entry minus put strike (${fmtLevel(ctx, putStrike)}) plus the put premium`,
    maxReward: "Open to the upside (futures gains, less the put cost)",
    invalidation: `A close below the protective put strike ${fmtLevel(ctx, putStrike)}`,
  };
}

function buildHedgedShortFuture(ctx: FynnContext, step: number): Strategy | null {
  const spot = ctx.spot;
  if (spot == null) return null;
  // Protective call at/above resistance or the call wall.
  const callStrike = snap(ctx.callWallStrike ?? ctx.resistanceHigh ?? spot + 2 * step, step);
  const legs: StrategyLeg[] = [futLeg("sell"), optLeg("buy", "CE", callStrike)];
  return {
    name: "Hedged Short Futures (Protective Call)",
    stance: "bearish",
    whyNow: `If price stays capped under resistance${ctx.callWallStrike ? ` and the call OI wall at ${fmtLevel(ctx, ctx.callWallStrike)}` : ""}, that's a bearish read. A short future paired with a protective ${fmtLevel(ctx, callStrike)} call caps the loss if the ceiling breaks upward.`,
    structure: structureLine(ctx, legs),
    legs,
    maxRisk: `Defined: call strike (${fmtLevel(ctx, callStrike)}) minus futures entry plus the call premium`,
    maxReward: "Open to the downside (futures gains, less the call cost)",
    invalidation: `A close above the protective call strike ${fmtLevel(ctx, callStrike)}`,
  };
}

function buildFynnFuturesPlan(ctx: FynnContext): FynnPlan {
  const step = strikeStepFor(ctx);
  const bias = deriveBias(ctx);
  const bullish = bias === "bullish" || bias === "lean-bullish";
  const bearish = bias === "bearish" || bias === "lean-bearish";

  const strategies: Strategy[] = [];
  if (bullish) {
    const s = buildHedgedLongFuture(ctx, step);
    if (s) strategies.push(s);
  } else if (bearish) {
    const s = buildHedgedShortFuture(ctx, step);
    if (s) strategies.push(s);
  } else {
    // No clean direction — present both hedged reads so the user can pick.
    const long = buildHedgedLongFuture(ctx, step);
    const short = buildHedgedShortFuture(ctx, step);
    if (long) strategies.push(long);
    if (short) strategies.push(short);
  }
  if (strategies.length === 0) {
    const s = buildHedgedLongFuture(ctx, step) ?? buildHedgedShortFuture(ctx, step);
    if (s) strategies.push(s);
  }

  const caveats = [
    "Futures use margin and leverage — losses (and gains) are amplified versus cash.",
    "The protective option is insurance: its premium is the cost of capping your risk.",
    ...buildCaveats(ctx),
  ].slice(0, 4);

  const sym = ctx.label || ctx.symbol;
  const headline = bias.includes("bull")
    ? `${sym}: holding support — long futures with a protective put`
    : bias.includes("bear")
      ? `${sym}: into resistance — short futures with a protective call`
      : `${sym}: no clean edge — hedged futures either way, pick your read`;

  return {
    bias,
    headline,
    rationale: rationaleFor(bias, ctx),
    keyLevels: {
      support: fmtBand(ctx, ctx.supportLow, ctx.supportHigh),
      resistance: fmtBand(ctx, ctx.resistanceLow, ctx.resistanceHigh),
      maxPain: fmtLevel(ctx, ctx.maxPain),
      putWall: ctx.putWallStrike != null ? fmtLevel(ctx, ctx.putWallStrike) : null,
      callWall: ctx.callWallStrike != null ? fmtLevel(ctx, ctx.callWallStrike) : null,
    },
    strategies: strategies.slice(0, 3),
    caveats,
  };
}

function buildCaveats(ctx: FynnContext): string[] {
  const caveats: string[] = [];
  if (ctx.volRegime) {
    caveats.push(
      ctx.volRegime === "CALM" || ctx.volRegime === "UNKNOWN"
        ? "Calm IV — option premiums are thinner; favour directional debit spreads over selling cheap premium."
        : ctx.volRegime === "ELEVATED"
          ? "Elevated IV — credit spreads can collect more premium, but moves can still breach strikes."
          : "Earnings/event window — IV can crush or gap; keep risk defined.",
    );
  }
  if (ctx.daysToExpiry != null && ctx.daysToExpiry < 14) {
    caveats.push(
      `Short-dated (~${ctx.daysToExpiry} days to expiry) — theta accelerates; max pain is a soft bias, not a target.`,
    );
  }
  if (ctx.spot != null && ctx.maxPain != null) {
    const gap = Math.abs(ctx.spot - ctx.maxPain) / ctx.spot;
    if (gap > 0.05) {
      caveats.push(
        `Max pain at ${fmtLevel(ctx, ctx.maxPain)} is far from spot — treat it as a gentle magnet, not a near-term target.`,
      );
    }
  }
  if (ctx.daysToEarnings != null && ctx.daysToEarnings <= 7) {
    caveats.push(`Results/event in ~${Math.round(ctx.daysToEarnings)} days — gap and IV-crush risk are elevated.`);
  }
  caveats.push("Verify liquidity on your broker before placing legs.");
  return caveats.slice(0, 4);
}

function headlineFor(bias: FynnPlan["bias"], ctx: FynnContext): string {
  const sym = ctx.label || ctx.symbol;
  if (bias.includes("bull")) return `${sym}: holding support — defined-risk bullish structures`;
  if (bias.includes("bear")) return `${sym}: into resistance — defined-risk bearish structures`;
  return `${sym}: range-bound — neutral premium or wait-for-clarity setups`;
}

function rationaleFor(bias: FynnPlan["bias"], ctx: FynnContext): string {
  const spot = fmtLevel(ctx, ctx.spot);
  const parts: string[] = [];
  if (spot) parts.push(`Spot at ${spot}`);
  if (ctx.supportLow != null) parts.push(`support band ${fmtBand(ctx, ctx.supportLow, ctx.supportHigh)}`);
  if (ctx.resistanceLow != null) parts.push(`resistance ${fmtBand(ctx, ctx.resistanceLow, ctx.resistanceHigh)}`);
  if (ctx.maxPain != null) parts.push(`max pain ${fmtLevel(ctx, ctx.maxPain)}`);
  if (ctx.daysToExpiry != null) parts.push(`~${ctx.daysToExpiry} days to expiry`);
  const intro = parts.length ? `${parts.join("; ")}.` : "Zone data loaded.";
  if (bias.includes("bull")) {
    return `${intro} Price is closer to support than resistance — bullish or neutral-bullish defined-risk structures fit best.`;
  }
  if (bias.includes("bear")) {
    return `${intro} Price is closer to resistance — bearish or neutral-bearish defined-risk structures fit best.`;
  }
  return `${intro} No clean directional edge — favour range trades or wait for a clearer break.`;
}

/** Build a validated plan purely from zone / IV rules (mode-aware). */
export function buildRulesFynnPlan(ctx: FynnContext): FynnPlan {
  if (ctx.mode === "futures") return buildFynnFuturesPlan(ctx);
  const step = strikeStepFor(ctx);
  const bias = deriveBias(ctx);
  const calm = isCalmIv(ctx);
  const strategies: Strategy[] = [];

  const bullish = bias === "bullish" || bias === "lean-bullish";
  const bearish = bias === "bearish" || bias === "lean-bearish";

  if (calm) {
    if (bullish) {
      const s = buildBullCallSpread(ctx, step);
      if (s) strategies.push(s);
    } else if (bearish) {
      const s = buildBearPutSpread(ctx, step);
      if (s) strategies.push(s);
    } else {
      const bull = buildBullCallSpread(ctx, step);
      const bear = buildBearPutSpread(ctx, step);
      if (bull) strategies.push(bull);
      if (bear) strategies.push(bear);
    }
  } else {
    if (bullish) {
      const s = buildBullPutSpread(ctx, step);
      if (s) strategies.push(s);
    } else if (bearish) {
      const s = buildBearCallSpread(ctx, step);
      if (s) strategies.push(s);
    } else {
      const condor = buildIronCondor(ctx, step);
      if (condor) strategies.push(condor);
    }
    if (strategies.length === 0) {
      const s = buildBullPutSpread(ctx, step) ?? buildBearCallSpread(ctx, step);
      if (s) strategies.push(s);
    }
  }

  if (strategies.length === 0) {
    const fallback = buildBullCallSpread(ctx, step) ?? buildBearPutSpread(ctx, step);
    if (fallback) strategies.push(fallback);
  }

  // Ensure first strategy matches IV rule (sanity for rules builder itself)
  if (calm && strategies[0] && strategyKind(strategies[0].legs) === "credit") {
    const debit =
      buildBullCallSpread(ctx, step) ?? buildBearPutSpread(ctx, step);
    if (debit) strategies.unshift(debit);
  }

  return {
    bias,
    headline: headlineFor(bias, ctx),
    rationale: rationaleFor(bias, ctx),
    keyLevels: {
      support: fmtBand(ctx, ctx.supportLow, ctx.supportHigh),
      resistance: fmtBand(ctx, ctx.resistanceLow, ctx.resistanceHigh),
      maxPain: fmtLevel(ctx, ctx.maxPain),
      putWall: ctx.putWallStrike != null ? fmtLevel(ctx, ctx.putWallStrike) : null,
      callWall: ctx.callWallStrike != null ? fmtLevel(ctx, ctx.callWallStrike) : null,
    },
    strategies: strategies.slice(0, 3),
    caveats: buildCaveats(ctx),
  };
}

/** Prefer AI plan when valid; otherwise deterministic rules plan. */
export function ensureValidFynnPlan(
  plan: FynnPlan,
  ctx: FynnContext,
): { plan: FynnPlan; source: "ai" | "rules"; issues: string[] } {
  const check = validateFynnPlan(plan, ctx);
  if (check.ok) return { plan, source: "ai", issues: [] };
  return { plan: buildRulesFynnPlan(ctx), source: "rules", issues: check.issues };
}
