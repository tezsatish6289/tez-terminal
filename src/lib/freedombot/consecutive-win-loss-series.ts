/**
 * Consecutive win / loss streak zig-zag by days since launch.
 *
 * Each episode starts on the zero line, steps +1/−1 per closed trade, then
 * returns to zero when direction flips. Quiet days sit flat on zero between
 * episodes — matching the hand-drawn sketch (diagonal zigs, always closing
 * back to the baseline).
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
  /** Positive = consecutive wins, negative = consecutive losses, 0 = baseline. */
  streak: number;
  /** UTC calendar date (YYYY-MM-DD) for tooltips. */
  date: string;
  /** Sort key when multiple points share the same day. */
  order: number;
}

export interface ConsecutiveWinLossSeries {
  day0: string;
  maxDay: number;
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

function utcDateKey(day0Ms: number, day: number): string {
  return new Date(day0Ms + day * MS_PER_DAY).toISOString().slice(0, 10);
}

function lastPoint(
  points: ConsecutiveWinLossPoint[],
): ConsecutiveWinLossPoint | undefined {
  return points[points.length - 1];
}

function pushPoint(
  points: ConsecutiveWinLossPoint[],
  day0Ms: number,
  day: number,
  streak: number,
  order: number,
): number {
  const prev = lastPoint(points);
  if (prev?.day === day && prev.streak === streak) return order;
  points.push({
    day,
    streak,
    date: utcDateKey(day0Ms, day),
    order,
  });
  return order + 1;
}

/** Extend the zero line forward to `day` before the next episode starts. */
function extendZeroLine(
  points: ConsecutiveWinLossPoint[],
  day0Ms: number,
  day: number,
  order: number,
): number {
  const prev = lastPoint(points);
  if (!prev || prev.day >= day) return order;
  if (prev.streak !== 0) return order;
  return pushPoint(points, day0Ms, day, 0, order);
}

/** Anchor an episode start on the zero line (skip if already there). */
function anchorEpisodeStart(
  points: ConsecutiveWinLossPoint[],
  day0Ms: number,
  day: number,
  order: number,
): number {
  order = extendZeroLine(points, day0Ms, day, order);
  return pushPoint(points, day0Ms, day, 0, order);
}

/**
 * Build zig-zag streak series — episodes from zero, back to zero on flips.
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
  const points: ConsecutiveWinLossPoint[] = [];
  let order = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  order = pushPoint(points, day0Ms, 0, 0, order);

  for (const t of closed) {
    const closeMs = parseMs(t.closedAt!);
    if (!Number.isFinite(closeMs)) continue;
    const day = dayIndex(day0Ms, closeMs);
    const pnl = t.realizedPnl ?? 0;

    if (pnl > 0) {
      if (lossStreak > 0) {
        order = pushPoint(points, day0Ms, day, 0, order);
        lossStreak = 0;
      }
      if (winStreak === 0) {
        order = anchorEpisodeStart(points, day0Ms, day, order);
      }
      winStreak += 1;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
      order = pushPoint(points, day0Ms, day, winStreak, order);
    } else if (pnl < 0) {
      if (winStreak > 0) {
        order = pushPoint(points, day0Ms, day, 0, order);
        winStreak = 0;
      }
      if (lossStreak === 0) {
        order = anchorEpisodeStart(points, day0Ms, day, order);
      }
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
      order = pushPoint(points, day0Ms, day, -lossStreak, order);
    }
  }

  const last = lastPoint(points);
  const currentStreak = last?.streak ?? 0;

  if (last && last.day < maxDay) {
    if (currentStreak === 0) {
      order = extendZeroLine(points, day0Ms, maxDay, order);
    } else {
      order = pushPoint(points, day0Ms, maxDay, 0, order);
    }
  }

  points.sort((a, b) => a.day - b.day || a.order - b.order);

  return {
    day0: new Date(day0Ms).toISOString(),
    maxDay,
    points,
    currentStreak,
    maxWinStreak,
    maxLossStreak,
  };
}
