/**
 * Consecutive win / loss streak by calendar day since launch (Day 0).
 * Wins plot above zero; losses plot below.
 */

export interface ClosedTradeForStreak {
  closedAt?: string | null;
  openedAt?: string | null;
  realizedPnl?: number | null;
  status?: string;
}

export interface ConsecutiveWinLossPoint {
  /** Days since Day 0 (launch). */
  day: number;
  /** Positive = consecutive wins, negative = consecutive losses, 0 = flat. */
  streak: number;
  /** UTC calendar date (YYYY-MM-DD) for tooltips. */
  date: string;
}

export interface ConsecutiveWinLossSeries {
  day0: string;
  points: ConsecutiveWinLossPoint[];
  currentStreak: number;
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

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build a daily streak series from closed trades.
 * @param day0Ms Launch timestamp — earliest daily metric for All Bots, or
 *               earliest trade open for a filtered bot.
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
  const streakByDay = new Map<number, number>();
  let currentStreak = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  for (const t of closed) {
    const closeMs = parseMs(t.closedAt!);
    if (!Number.isFinite(closeMs)) continue;
    const day = dayIndex(day0Ms, closeMs);

    const pnl = t.realizedPnl ?? 0;
    if (pnl > 0) {
      winStreak += 1;
      lossStreak = 0;
      currentStreak = winStreak;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (pnl < 0) {
      lossStreak += 1;
      winStreak = 0;
      currentStreak = -lossStreak;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }

    streakByDay.set(day, currentStreak);
  }

  const points: ConsecutiveWinLossPoint[] = [];
  let lastStreak = 0;
  for (let day = 0; day <= maxDay; day++) {
    if (streakByDay.has(day)) {
      lastStreak = streakByDay.get(day)!;
    }
    points.push({
      day,
      streak: lastStreak,
      date: utcDateKey(day0Ms + day * MS_PER_DAY),
    });
  }

  return {
    day0: new Date(day0Ms).toISOString(),
    points,
    currentStreak: lastStreak,
    maxWinStreak,
    maxLossStreak,
  };
}
