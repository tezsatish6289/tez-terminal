/**
 * Daily win/loss counts with cumulative net (wins − losses) by days since launch.
 */

export interface ClosedTradeForStreak {
  closedAt?: string | null;
  openedAt?: string | null;
  realizedPnl?: number | null;
  status?: string;
}

export interface DailyWinLossPoint {
  /** Days since Day 0 (launch). */
  day: number;
  /** UTC calendar date (YYYY-MM-DD) for tooltips. */
  date: string;
  /** Wins closed this day. */
  wins: number;
  /** Losses closed this day. */
  losses: number;
  /** Negative bar height for chart (−losses, 0 when none). */
  lossBar: number;
  /** Running net win count (total wins − total losses through this day). */
  cumulativeNet: number;
}

export interface ConsecutiveWinLossSeries {
  day0: string;
  maxDay: number;
  points: DailyWinLossPoint[];
  /** Final cumulative net (wins − losses). */
  cumulativeNet: number;
  /** Alias kept for the chart badge. */
  currentStreak: number;
  totalWins: number;
  totalLosses: number;
  maxWinStreak: number;
  maxLossStreak: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function dayIndex(fromMs: number, atMs: number): number {
  return Math.max(0, Math.floor((atMs - fromMs) / MS_PER_DAY));
}

function utcDateKey(day0Ms: number, day: number): string {
  return new Date(day0Ms + day * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Build daily win/loss bars + cumulative net line series.
 */
export function buildConsecutiveWinLossSeries(
  trades: ClosedTradeForStreak[],
  day0Ms: number,
  nowMs: number = Date.now(),
): ConsecutiveWinLossSeries | null {
  if (!Number.isFinite(day0Ms)) return null;

  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.closedAt)
    .sort(
      (a, b) =>
        new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime(),
    );

  const maxDay = dayIndex(day0Ms, nowMs);
  const winsByDay = new Map<number, number>();
  const lossesByDay = new Map<number, number>();

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let winStreak = 0;
  let lossStreak = 0;

  for (const t of closed) {
    const closeMs = parseMs(t.closedAt!);
    if (!Number.isFinite(closeMs)) continue;
    const day = dayIndex(day0Ms, closeMs);
    const pnl = t.realizedPnl ?? 0;

    if (pnl > 0) {
      winsByDay.set(day, (winsByDay.get(day) ?? 0) + 1);
      if (lossStreak > 0) lossStreak = 0;
      winStreak += 1;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (pnl < 0) {
      lossesByDay.set(day, (lossesByDay.get(day) ?? 0) + 1);
      if (winStreak > 0) winStreak = 0;
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }

  const points: DailyWinLossPoint[] = [];
  let cumulativeNet = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (let day = 0; day <= maxDay; day++) {
    const wins = winsByDay.get(day) ?? 0;
    const losses = lossesByDay.get(day) ?? 0;
    cumulativeNet += wins - losses;
    totalWins += wins;
    totalLosses += losses;
    points.push({
      day,
      date: utcDateKey(day0Ms, day),
      wins,
      losses,
      lossBar: losses > 0 ? -losses : 0,
      cumulativeNet,
    });
  }

  return {
    day0: new Date(day0Ms).toISOString(),
    maxDay,
    points,
    cumulativeNet,
    currentStreak: cumulativeNet,
    totalWins,
    totalLosses,
    maxWinStreak,
    maxLossStreak,
  };
}
