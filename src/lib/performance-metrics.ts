import type { SimTrade, SimTradeEvent } from "./simulator";

// Trading days per year used for annualisation of daily-return-based ratios.
const TRADING_DAYS_PER_YEAR = 252;

/**
 * True net PnL after ALL charges, backward-compatible with both old trades
 * (realizedPnl excludes entry fee) and new trades (realizedPnl includes it).
 *
 * Uses raw events: sum(event.pnl) - events[0].fee
 *   events[0] = OPEN event (pnl=0, fee=entryFee)
 *   events[1..n] = exits (pnl = pricePnl - exitFee each)
 *   → result = pricePnl - exitFees - entryFee = true net after all charges
 */
function trueNetPnl(events: SimTradeEvent[]): number {
  if (!events.length) return 0;
  return events.reduce((s, e) => s + e.pnl, 0) - events[0].fee;
}

export interface PerformanceMetrics {
  maxDrawdownPct: number;   // e.g. 0.2968 → 29.68 %
  calmarRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  annualizedReturnPct: number; // e.g. 0.50 → 50 %
  tradingDays: number;
}

/**
 * Computes Sharpe, Sortino, Calmar and Max Drawdown from a set of closed
 * simulator trades.
 *
 * All ratios are annualised.  Returns null when there is not enough data
 * (fewer than 5 closed trades or fewer than 2 trading days with activity).
 *
 * @param trades             Array of SimTrade (open + closed; only closed ones are used)
 * @param startingCapital    Starting capital for the simulator run
 * @param riskFreeRateAnnual Annual risk-free rate as a decimal (0 for crypto, ~0.065 for IN)
 */
export function calcPerformanceMetrics(
  trades: SimTrade[],
  startingCapital: number,
  riskFreeRateAnnual = 0,
): PerformanceMetrics | null {
  const closed = trades
    .filter((t) => t.closedAt && t.status === "CLOSED")
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

  if (closed.length < 5) return null;

  // ── 1. Equity curve & Max Drawdown ──────────────────────────────────────────
  // realizedPnl already includes ALL fees (entry + exit) since we initialise
  // the trade with realizedPnl = -entryFee.
  let capital = startingCapital;
  let peak = startingCapital;
  let maxDrawdown = 0;

  for (const t of closed) {
    capital += trueNetPnl(t.events ?? []);
    if (capital > peak) peak = capital;
    const dd = peak > 0 ? (peak - capital) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const endCapital = capital;

  // ── 2. Annualised return & Calmar ────────────────────────────────────────────
  const firstMs = new Date(closed[0].closedAt!).getTime();
  const lastMs  = new Date(closed[closed.length - 1].closedAt!).getTime();
  const calendarDays = Math.max(1, (lastMs - firstMs) / 86_400_000);

  const totalReturn = (endCapital - startingCapital) / startingCapital;
  // Compound annualisation: (1 + r)^(365 / days) - 1
  const annualizedReturn = Math.pow(1 + totalReturn, 365 / calendarDays) - 1;
  const calmarRatio = maxDrawdown > 0
    ? annualizedReturn / maxDrawdown
    : annualizedReturn > 0 ? Infinity : 0;

  // ── 3. Daily returns for Sharpe / Sortino ───────────────────────────────────
  // Group trades by their close date (YYYY-MM-DD in local-ish ISO string).
  // We track the running capital at the start of each day so the denominator
  // for each day's return is accurate.
  const dayPnl     = new Map<string, number>();
  const dayCapital = new Map<string, number>();
  let running = startingCapital;

  for (const t of closed) {
    const day = t.closedAt!.slice(0, 10); // "YYYY-MM-DD"
    if (!dayCapital.has(day)) dayCapital.set(day, running);
    const net = trueNetPnl(t.events ?? []);
    dayPnl.set(day, (dayPnl.get(day) ?? 0) + net);
    running += net;
  }

  // One return value per active trading day.
  const dailyReturns: number[] = [];
  for (const [day, pnl] of dayPnl) {
    const startCap = dayCapital.get(day) ?? startingCapital;
    if (startCap > 0) dailyReturns.push(pnl / startCap);
  }

  const tradingDays = dailyReturns.length;

  if (tradingDays < 2) {
    return {
      maxDrawdownPct: maxDrawdown * 100,
      calmarRatio,
      sharpeRatio: 0,
      sortinoRatio: 0,
      annualizedReturnPct: annualizedReturn * 100,
      tradingDays,
    };
  }

  const rfDaily = riskFreeRateAnnual / TRADING_DAYS_PER_YEAR;
  const n       = dailyReturns.length;
  const mean    = dailyReturns.reduce((a, r) => a + r, 0) / n;

  // Population std dev of daily returns
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1);
  const std       = Math.sqrt(variance);

  // Sharpe (annualised)
  const sharpeRatio = std > 0
    ? ((mean - rfDaily) / std) * Math.sqrt(TRADING_DAYS_PER_YEAR)
    : 0;

  // Sortino: downside deviation uses returns below the risk-free rate
  const downsideReturns  = dailyReturns.filter((r) => r < rfDaily);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((a, r) => a + (r - rfDaily) ** 2, 0) / downsideReturns.length
    : 0;
  const downsideStd = Math.sqrt(downsideVariance);

  const sortinoRatio = downsideStd > 0
    ? ((mean - rfDaily) / downsideStd) * Math.sqrt(TRADING_DAYS_PER_YEAR)
    : sharpeRatio > 0 ? Infinity : 0;

  return {
    maxDrawdownPct: maxDrawdown * 100,
    calmarRatio,
    sharpeRatio,
    sortinoRatio,
    annualizedReturnPct: annualizedReturn * 100,
    tradingDays,
  };
}
