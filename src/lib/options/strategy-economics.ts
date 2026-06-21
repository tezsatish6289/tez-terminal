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

/** An option leg priced by premium (Black-Scholes estimate or live mark). */
export interface OptionStrategyLeg {
  kind?: "option";
  action: "buy" | "sell";
  optionType: OptionType;
  strike: number;
  /** Premium per share (estimated or live). */
  premium: number;
}

/** A linear futures / underlying leg. P&L = sign·(S − entry) per share. */
export interface FutureStrategyLeg {
  kind: "future";
  action: "buy" | "sell";
  /** Entry price per share (≈ spot for the future). */
  entry: number;
}

export type StrategyLeg = OptionStrategyLeg | FutureStrategyLeg;

function isFutureLeg(leg: StrategyLeg): leg is FutureStrategyLeg {
  return leg.kind === "future";
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
  /**
   * Optional "if price reaches level X" projection for open-ended structures
   * (e.g. a hedged long future toward resistance). Populated by the caller that
   * knows the zone levels — NOT a hard target, just a conditional scenario.
   */
  scenario?: { label: string; pnl: number } | null;
}

const EPS = 1e-6;

function legPnlAt(leg: StrategyLeg, s: number): number {
  const sign = leg.action === "buy" ? 1 : -1;
  if (isFutureLeg(leg)) {
    return sign * (s - leg.entry);
  }
  const intrinsic =
    leg.optionType === "CE" ? Math.max(s - leg.strike, 0) : Math.max(leg.strike - s, 0);
  return sign * (intrinsic - leg.premium);
}

function pnlAt(legs: StrategyLeg[], s: number): number {
  return legs.reduce((acc, leg) => acc + legPnlAt(leg, s), 0);
}

/** Per-share expiry P&L of the whole structure at underlying price `s`. */
export function strategyPayoffAt(legs: StrategyLeg[], s: number): number {
  return r2(pnlAt(legs, s));
}

/** Round to a sensible number of paise. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeStrategyEconomics(legs: StrategyLeg[]): StrategyEconomics | null {
  if (!legs.length) return null;
  for (const leg of legs) {
    if (isFutureLeg(leg)) {
      if (!(leg.entry > 0)) return null;
    } else if (!(leg.strike > 0) || !Number.isFinite(leg.premium)) {
      return null;
    }
  }

  // Only option legs carry an upfront premium; a future is entered at market.
  const netDebit = legs.reduce(
    (acc, l) => (isFutureLeg(l) ? acc : acc + (l.action === "buy" ? l.premium : -l.premium)),
    0,
  );

  // Kinks occur only at option strikes; a future is linear. Include future
  // entries too so a break-even sitting near entry is still captured.
  const pivots = legs.map((l) => (isFutureLeg(l) ? l.entry : l.strike));
  const strikes = [...new Set(pivots)].sort((a, b) => a - b);
  const maxStrike = strikes[strikes.length - 1];
  // Break-points span the full payoff: 0, every pivot, and a far point to read
  // the asymptotic direction beyond the outermost pivot.
  const breakpoints = [0, ...strikes, maxStrike * 3 + 1];

  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  for (const s of breakpoints) {
    const p = pnlAt(legs, s);
    if (p > maxProfit) maxProfit = p;
    if (p < maxLoss) maxLoss = p;
  }

  // Only the UPPER tail (S→∞) can be genuinely unbounded. The lower side is
  // bounded because the underlying can't go below 0 — that extreme is already
  // captured by the S=0 break-point above. So we read the slope past the
  // outermost strike: rising → profit open-ended, falling → loss open-ended.
  const farLow = pnlAt(legs, maxStrike * 3 + 1);
  const farHigh = pnlAt(legs, maxStrike * 3 + 1 + 1000);
  const profitUnbounded = farHigh - farLow > EPS;
  const lossUnbounded = farHigh - farLow < -EPS;

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
