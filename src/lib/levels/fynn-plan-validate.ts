/**
 * Post-AI validation for Fynn plans. Rejects output that drifts from zone data
 * or breaks IV / defined-risk rules before it reaches the user.
 */

import type { FynnContext, FynnPlan } from "@/ai/flows/fynn-strategy-flow";

export interface FynnPlanValidation {
  ok: boolean;
  issues: string[];
}

type StrategyLeg = FynnPlan["strategies"][number]["legs"][number];

function isCalmIv(ctx: FynnContext): boolean {
  const flag = ctx.volRegime?.toUpperCase();
  return flag === "CALM" || flag === "UNKNOWN" || flag == null;
}

function isElevatedIv(ctx: FynnContext): boolean {
  const flag = ctx.volRegime?.toUpperCase();
  return flag === "ELEVATED" || flag === "EARNINGS";
}

/** Infer strike step when the stored doc doesn't have one. */
export function defaultStrikeStep(spot: number | null): number {
  if (spot == null || spot <= 0) return 50;
  if (spot >= 3000) return 100;
  if (spot >= 1000) return 50;
  if (spot >= 500) return 20;
  if (spot >= 200) return 10;
  return 5;
}

export function strikeStepFor(ctx: FynnContext): number {
  if (ctx.strikeStep != null && ctx.strikeStep > 0) return ctx.strikeStep;
  return defaultStrikeStep(ctx.spot);
}

function snapStrike(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function onStrikeGrid(strike: number, step: number): boolean {
  const snapped = snapStrike(strike, step);
  return Math.abs(strike - snapped) < step * 0.01 + 1e-6;
}

/** Strikes the model is allowed to use: anchors ± a few steps. */
export function allowedStrikes(ctx: FynnContext, step: number): Set<number> {
  const anchors = [
    ctx.spot,
    ctx.maxPain,
    ctx.supportLow,
    ctx.supportHigh,
    ctx.resistanceLow,
    ctx.resistanceHigh,
    ctx.putWallStrike,
    ctx.callWallStrike,
  ].filter((v): v is number => v != null && v > 0);

  if (ctx.spot != null) {
    anchors.push(snapStrike(ctx.spot, step));
  }

  const allowed = new Set<number>();
  for (const anchor of anchors) {
    for (let d = -4; d <= 4; d++) {
      const s = snapStrike(anchor + d * step, step);
      if (s > 0) allowed.add(s);
    }
  }
  return allowed;
}

function isOption(leg: StrategyLeg): boolean {
  return leg.instrument !== "future";
}
function isFuture(leg: StrategyLeg): boolean {
  return leg.instrument === "future";
}

/** Classify a pure option spread direction (futures legs ignored). */
export function strategyKind(legs: StrategyLeg[]): "debit" | "credit" | "other" {
  const opts = legs.filter(isOption);
  if (opts.length !== 2) return opts.length === 4 ? "credit" : "other";
  const [a, b] = opts;
  if (a.optionType !== b.optionType) return "other";
  const buy = opts.find((l) => l.action === "buy");
  const sell = opts.find((l) => l.action === "sell");
  if (!buy || !sell || buy.strike == null || sell.strike == null) return "other";
  if (a.optionType === "CE") return buy.strike < sell.strike ? "debit" : "credit";
  return buy.strike > sell.strike ? "debit" : "credit";
}

/** Options-mode defined-risk shapes: vertical spread, long single, iron condor. */
function isDefinedRiskOptions(legs: StrategyLeg[]): boolean {
  if (legs.some(isFuture)) return false;
  if (legs.length === 0) return false;
  if (legs.length === 1) return legs[0].action === "buy";
  if (legs.length === 2) {
    const types = new Set(legs.map((l) => l.optionType));
    const actions = legs.map((l) => l.action).sort().join(",");
    return types.size === 1 && actions === "buy,sell";
  }
  if (legs.length === 4) {
    const calls = legs.filter((l) => l.optionType === "CE");
    const puts = legs.filter((l) => l.optionType === "PE");
    return calls.length === 2 && puts.length === 2;
  }
  return false;
}

/**
 * Futures-mode safety: there must be a future leg AND a bought option that
 * hedges the adverse side (long future → bought PUT; short future → bought CALL).
 * This guarantees no naked/unhedged futures advice ever ships.
 */
function isHedgedFutures(legs: StrategyLeg[]): boolean {
  const futures = legs.filter(isFuture);
  if (futures.length !== 1) return false;
  const fut = futures[0];
  const boughtPuts = legs.some(
    (l) => isOption(l) && l.action === "buy" && l.optionType === "PE",
  );
  const boughtCalls = legs.some(
    (l) => isOption(l) && l.action === "buy" && l.optionType === "CE",
  );
  return fut.action === "buy" ? boughtPuts : boughtCalls;
}

export function validateFynnPlan(plan: FynnPlan, ctx: FynnContext): FynnPlanValidation {
  const issues: string[] = [];
  const step = strikeStepFor(ctx);
  const allowed = allowedStrikes(ctx, step);
  const isFuturesMode = ctx.mode === "futures";

  if (!plan.strategies.length || plan.strategies.length > 3) {
    issues.push("strategy_count");
  }

  for (const [i, strategy] of plan.strategies.entries()) {
    if (!strategy.legs?.length || strategy.legs.length > 4) {
      issues.push(`strategy_${i}_legs`);
      continue;
    }

    if (isFuturesMode) {
      if (!isHedgedFutures(strategy.legs)) {
        issues.push(`strategy_${i}_unhedged_futures`);
      }
    } else if (!isDefinedRiskOptions(strategy.legs)) {
      issues.push(`strategy_${i}_undefined_risk`);
    }

    // Validate every OPTION leg's strike (futures legs carry no strike).
    for (const leg of strategy.legs) {
      if (isFuture(leg)) continue;
      if (leg.strike == null || !(leg.strike > 0)) {
        issues.push(`strategy_${i}_invalid_strike`);
        continue;
      }
      if (!onStrikeGrid(leg.strike, step)) {
        issues.push(`strategy_${i}_strike_off_grid`);
      }
      if (!allowed.has(snapStrike(leg.strike, step))) {
        issues.push(`strategy_${i}_strike_not_anchored`);
      }
    }
  }

  // Options-mode IV discipline (calm → debit-led; elevated → not debit-only).
  if (!isFuturesMode) {
    const first = plan.strategies[0];
    if (first) {
      const kind = strategyKind(first.legs);
      if (isCalmIv(ctx) && kind === "credit") issues.push("calm_iv_credit_lead");
      if (isElevatedIv(ctx) && kind === "debit" && plan.strategies.length === 1) {
        issues.push("elevated_iv_debit_only");
      }
    }
  }

  const banned = /\b(guaranteed|sure-?shot|tip)\b/i;
  const text = [
    plan.headline,
    plan.rationale,
    ...plan.strategies.flatMap((s) => [s.whyNow, s.structure, s.maxRisk, s.maxReward]),
  ].join(" ");
  if (banned.test(text)) {
    issues.push("banned_language");
  }

  return { ok: issues.length === 0, issues };
}
