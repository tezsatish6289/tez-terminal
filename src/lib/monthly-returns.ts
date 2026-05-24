import { format } from "date-fns";
import { buildEquityCurve, type ClosedTradeLike } from "@/lib/equity-curve";

export interface MonthlyReturnPoint {
  /** YYYY-MM */
  monthKey: string;
  /** e.g. Mar '26 */
  label: string;
  /** Net P&L closed in this calendar month */
  monthPnl: number;
  /** Capital at first close of month (end of prior month) */
  capitalStart: number;
  /** Capital after last close of month */
  capitalEnd: number;
  /** (monthPnl / capitalStart) × 100 */
  monthlyReturnPct: number;
  /** ((capitalEnd − startingCapital) / startingCapital) × 100 */
  cumulativeReturnPct: number;
}

/**
 * Calendar-month return series from closed trades.
 * Monthly % uses capital at month open; cumulative % is total return vs starting capital.
 */
export function buildMonthlyReturnSeries(
  trades: ClosedTradeLike[],
  startingCapital: number,
): MonthlyReturnPoint[] {
  const curve = buildEquityCurve(trades, startingCapital);
  if (!curve.points.length || startingCapital <= 0) return [];

  const monthPnl = new Map<string, number>();
  const monthEndCapital = new Map<string, number>();

  for (const p of curve.points) {
    const key = p.closedAt.slice(0, 7);
    monthPnl.set(key, (monthPnl.get(key) ?? 0) + (p.trade.realizedPnl ?? 0));
    monthEndCapital.set(key, p.value);
  }

  const months = [...monthEndCapital.keys()].sort();
  const out: MonthlyReturnPoint[] = [];
  let prevCapital = startingCapital;

  for (const monthKey of months) {
    const capitalEnd = monthEndCapital.get(monthKey)!;
    const pnl = monthPnl.get(monthKey) ?? 0;
    const capitalStart = prevCapital;
    const monthlyReturnPct =
      capitalStart > 0 ? parseFloat(((pnl / capitalStart) * 100).toFixed(2)) : 0;
    const cumulativeReturnPct = parseFloat(
      (((capitalEnd - startingCapital) / startingCapital) * 100).toFixed(2),
    );

    out.push({
      monthKey,
      label: format(new Date(`${monthKey}-01T12:00:00`), "MMM yy"),
      monthPnl: parseFloat(pnl.toFixed(2)),
      capitalStart,
      capitalEnd,
      monthlyReturnPct,
      cumulativeReturnPct,
    });
    prevCapital = capitalEnd;
  }

  return out;
}
