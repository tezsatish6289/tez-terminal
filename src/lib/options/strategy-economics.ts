/**
 * Compute the expiry economics of an option strategy from its legs.
 *
 * The model (LLM) only chooses the legs; ALL arithmetic happens here so the
 * numbers are trustworthy. Works for any defined-risk vertical / iron condor /
 * single-leg position by evaluating the piecewise-linear expiry P&L: kinks only
 * occur at strikes, so max profit, max loss and break-evens are exact at (or
 * interpolated between) the strike break-points.
 *
 * All figures are PER SHARE (= premium points). Multiply by the contract lot
 * size for the rupee total per lot (lot size isn't tracked in this codebase).
 */

import type { OptionType } from "@/lib/options/black-scholes";

export interface StrategyLeg {
  action: "buy" | "sell";
  optionType: OptionType;
  strike: number;
  /** Premium per share (estimated or live). */
  premium: number;
}

export interface StrategyEconomics {
  /** Net premium per share. Positive = net debit (you pay); negative = net credit (you receive). */
  netDebit: number;
  kind: "debit" | "credit" | "flat";
  /** Max profit per share (null = theoretically unbounded). */
  maxProfit: number | null;
  /** Max loss per share as a positive number (null = theoretically unbounded). */
  maxLoss: number | null;
  /** Break-even underlying price(s) at expiry. */
  breakevens: number[];
  /** Reward : risk ratio (maxProfit / maxLoss), null when either side is unbounded/zero. */
  riskReward: number | null;
}

const EPS = 1e-6;

function legPnlAt(leg: StrategyLeg, s: number): number {
  const intrinsic =
    leg.optionType === "CE" ? Math.max(s - leg.strike, 0) : Math.max(leg.strike - s, 0);
  const sign = leg.action === "buy" ? 1 : -1;
  return sign * (intrinsic - leg.premium);
}

function pnlAt(legs: StrategyLeg[], s: number): number {
  return legs.reduce((acc, leg) => acc + legPnlAt(leg, s), 0);
}

/** Round to a sensible number of paise. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeStrategyEconomics(legs: StrategyLeg[]): StrategyEconomics | null {
  if (!legs.length || legs.some((l) => !(l.strike > 0) || !Number.isFinite(l.premium))) {
    return null;
  }

  const netDebit = legs.reduce(
    (acc, l) => acc + (l.action === "buy" ? l.premium : -l.premium),
    0,
  );

  const strikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  const maxStrike = strikes[strikes.length - 1];
  // Break-points span the full payoff: 0, every strike, and a far point to read
  // the asymptotic direction beyond the outermost strike.
  const breakpoints = [0, ...strikes, maxStrike * 3 + 1];

  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  for (const s of breakpoints) {
    const p = pnlAt(legs, s);
    if (p > maxProfit) maxProfit = p;
    if (p < maxLoss) maxLoss = p;
  }

  // Unbounded check: compare the slope at the far edge. If P&L is still rising
  // (or falling) at the far point vs the last strike, that tail is unbounded.
  const farLow = pnlAt(legs, maxStrike * 3 + 1);
  const farHigh = pnlAt(legs, maxStrike * 3 + 1 + 1000);
  const tailRising = farHigh - farLow > EPS;
  const tailFalling = farHigh - farLow < -EPS;
  // Net call/put exposure tells us about the lower tail (S→0) too.
  const lowLow = pnlAt(legs, 1);
  const lowHigh = pnlAt(legs, 0);
  const lowTailRising = lowLow - lowHigh > EPS; // P&L increases as S falls toward 0

  const profitUnbounded = tailRising || lowTailRising;
  const lossUnbounded = tailFalling || lowLow - lowHigh < -EPS;

  const breakevens: number[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    const pa = pnlAt(legs, a);
    const pb = pnlAt(legs, b);
    if ((pa <= 0 && pb >= 0) || (pa >= 0 && pb <= 0)) {
      if (Math.abs(pb - pa) < EPS) continue;
      const cross = a + ((0 - pa) / (pb - pa)) * (b - a);
      if (cross >= 0) breakevens.push(r2(cross));
    }
  }

  const kind: StrategyEconomics["kind"] =
    netDebit > EPS ? "debit" : netDebit < -EPS ? "credit" : "flat";

  const mp = profitUnbounded ? null : r2(maxProfit);
  const ml = lossUnbounded ? null : r2(Math.abs(Math.min(maxLoss, 0)));

  return {
    netDebit: r2(netDebit),
    kind,
    maxProfit: mp,
    maxLoss: ml,
    breakevens: [...new Set(breakevens)].sort((a, b) => a - b),
    riskReward: mp != null && ml != null && ml > EPS ? Math.round((mp / ml) * 100) / 100 : null,
  };
}
