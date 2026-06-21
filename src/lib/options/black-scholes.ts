/**
 * Minimal Black-Scholes European option pricer.
 *
 * Used to ESTIMATE option premiums for Fynn's strategy economics when live
 * mark prices aren't available. Indian stock/index options are European-style,
 * so BS is a fair model. Estimates ignore skew (single ATM IV per chain) and
 * dividends — close enough for near-the-money, near-dated strikes, and clearly
 * labelled as estimates in the UI.
 */

/** Standard-normal CDF via Abramowitz-Stegun erf (max error ~1.5e-7). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-(x / Math.SQRT2) * (x / Math.SQRT2));
  const erf = x >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

export type OptionType = "CE" | "PE";

/** India risk-free rate (~6.5%) — used for discounting the strike. */
export const DEFAULT_RISK_FREE_RATE = 0.065;

/**
 * Theoretical option price (per share).
 * @param spot   underlying price
 * @param strike strike price
 * @param ivPct  implied volatility in PERCENT points (e.g. 32.16 for 32.16%)
 * @param days   calendar days to expiry
 */
export function blackScholesPrice(
  type: OptionType,
  spot: number,
  strike: number,
  ivPct: number,
  days: number,
  rate: number = DEFAULT_RISK_FREE_RATE,
): number | null {
  if (!(spot > 0) || !(strike > 0) || !(ivPct > 0)) return null;
  const t = Math.max(days, 0.5) / 365; // floor at half a day so expiry-day pricing stays finite
  const sigma = ivPct / 100;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + (sigma * sigma) / 2) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-rate * t);
  const price =
    type === "CE"
      ? spot * normCdf(d1) - strike * disc * normCdf(d2)
      : strike * disc * normCdf(-d2) - spot * normCdf(-d1);
  return Math.max(price, 0);
}
