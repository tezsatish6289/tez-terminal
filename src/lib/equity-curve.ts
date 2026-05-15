// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for "fund value over time" computed from CLOSED
// trades. Used by:
//
//   • /simulation       (TezTerminal simulator dashboard)
//   • /freedombot/performance  (Public live performance page)
//
// Walks closed trades chronologically (oldest → newest) and accumulates
// `trade.realizedPnl`. The simulator initialises `realizedPnl` to `-entryFee`
// at open and grows it by `(pnl - exitFee)` on every partial exit (TP1, TP2,
// TP3, SL, breakeven, force-close), so it already represents the TRUE
// after-all-fees P&L exactly as shown in the "Net PNL" column of the history
// table.
//
// Guarantees:
//   1. row(N).balance − row(N−1).balance === trade N's Net PNL.
//   2. Chart point #N === history row #N's balance.
//   3. Final equity === starting capital + Σ realizedPnl of closed trades.
//
// Open trades are intentionally excluded — their entry fees and any partial
// closes will roll into the equity curve once those trades fully close.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClosedTradeLike {
  id?: string;
  signalId?: string | null;
  symbol?: string;
  closedAt?: string | null;
  realizedPnl?: number | null;
}

export interface EquityPoint<T> {
  tradeNumber: number;
  value: number;
  closedAt: string;
  symbol: string;
  trade: T;
}

export interface EquityCurveResult<T> {
  /** Final equity = startingCapital + Σ realizedPnl of all closed trades. */
  finalCapital: number;
  /** All closed trades sorted oldest → newest by closedAt. */
  sortedClosedTrades: T[];
  /** Map: trade.id (or signalId) → sequential trade number (1-based). */
  tradeNumberMap: Map<string, number>;
  /** Map: trade.id (or signalId) → running balance after that trade closed. */
  balanceAfterMap: Map<string, number>;
  /** One point per closed trade — feed directly into chart libraries. */
  points: EquityPoint<T>[];
}

export function buildEquityCurve<T extends ClosedTradeLike>(
  trades: T[],
  startingCapital: number,
): EquityCurveResult<T> {
  const sorted = trades
    .filter((t) => t.closedAt)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

  const tradeNumberMap = new Map<string, number>();
  const balanceAfterMap = new Map<string, number>();
  const points: EquityPoint<T>[] = [];

  let capital = startingCapital;
  sorted.forEach((t, i) => {
    capital += t.realizedPnl ?? 0;
    const value = parseFloat(capital.toFixed(2));

    const key = t.id ?? t.signalId ?? undefined;
    if (key) {
      tradeNumberMap.set(key, i + 1);
      balanceAfterMap.set(key, value);
    }
    points.push({
      tradeNumber: i + 1,
      value,
      closedAt: t.closedAt!,
      symbol: t.symbol ?? "—",
      trade: t,
    });
  });

  return {
    finalCapital: parseFloat(capital.toFixed(2)),
    sortedClosedTrades: sorted,
    tradeNumberMap,
    balanceAfterMap,
    points,
  };
}
