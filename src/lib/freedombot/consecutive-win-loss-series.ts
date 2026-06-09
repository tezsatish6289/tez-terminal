/**
 * Consecutive win / loss streak spikes by days since launch (Day 0).
 * Each completed streak is a single spike: 0 → full count → 0, skipping
 * the calendar days in between while the streak was building.
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
  /** Sort key when multiple points share the same day (spike up then down). */
  order: number;
  /** Full streak length — only set on the peak point. */
  streakLength?: number;
  /** Calendar days the streak spanned (inclusive). */
  streakSpanDays?: number;
}

export interface ConsecutiveWinLossSeries {
  day0: string;
  maxDay: number;
  points: ConsecutiveWinLossPoint[];
  currentStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
}

interface StreakSegment {
  startDay: number;
  endDay: number;
  streak: number;
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

function pushPoint(
  points: ConsecutiveWinLossPoint[],
  day0Ms: number,
  day: number,
  streak: number,
  order: number,
  meta?: Pick<ConsecutiveWinLossPoint, "streakLength" | "streakSpanDays">,
): void {
  points.push({
    day,
    streak,
    date: utcDateKey(day0Ms, day),
    order,
    ...meta,
  });
}

function extractStreakSegments(
  closed: ClosedTradeForStreak[],
  day0Ms: number,
): {
  segments: StreakSegment[];
  currentStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
} {
  const segments: StreakSegment[] = [];
  let winStreak = 0;
  let lossStreak = 0;
  let winStartDay: number | null = null;
  let lossStartDay: number | null = null;
  let lastWinDay = 0;
  let lastLossDay = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  const closeWinStreak = () => {
    if (winStreak > 0 && winStartDay != null) {
      segments.push({ startDay: winStartDay, endDay: lastWinDay, streak: winStreak });
    }
    winStreak = 0;
    winStartDay = null;
  };

  const closeLossStreak = () => {
    if (lossStreak > 0 && lossStartDay != null) {
      segments.push({
        startDay: lossStartDay,
        endDay: lastLossDay,
        streak: -lossStreak,
      });
    }
    lossStreak = 0;
    lossStartDay = null;
  };

  for (const t of closed) {
    const closeMs = parseMs(t.closedAt!);
    if (!Number.isFinite(closeMs)) continue;
    const day = dayIndex(day0Ms, closeMs);
    const pnl = t.realizedPnl ?? 0;

    if (pnl > 0) {
      closeLossStreak();
      if (winStreak === 0) winStartDay = day;
      winStreak += 1;
      lastWinDay = day;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (pnl < 0) {
      closeWinStreak();
      if (lossStreak === 0) lossStartDay = day;
      lossStreak += 1;
      lastLossDay = day;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }

  closeWinStreak();
  closeLossStreak();

  const lastSeg = segments[segments.length - 1];
  const currentStreak = lastSeg?.streak ?? 0;

  return { segments, currentStreak, maxWinStreak, maxLossStreak };
}

/**
 * Build sparse spike series — one 0 → peak → 0 arc per streak episode.
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
  const { segments, currentStreak, maxWinStreak, maxLossStreak } =
    extractStreakSegments(closed, day0Ms);

  const points: ConsecutiveWinLossPoint[] = [];
  let order = 0;
  pushPoint(points, day0Ms, 0, 0, order++);

  for (const seg of segments) {
    const spanDays = seg.endDay - seg.startDay + 1;
    const length = Math.abs(seg.streak);
    if (length === 0) continue;

    if (seg.startDay === seg.endDay) {
      pushPoint(points, day0Ms, seg.endDay, 0, order++);
      pushPoint(points, day0Ms, seg.endDay, seg.streak, order++, {
        streakLength: length,
        streakSpanDays: spanDays,
      });
      pushPoint(points, day0Ms, seg.endDay, 0, order++);
      continue;
    }

    pushPoint(points, day0Ms, seg.startDay, 0, order++);
    pushPoint(points, day0Ms, seg.endDay, seg.streak, order++, {
      streakLength: length,
      streakSpanDays: spanDays,
    });
    pushPoint(points, day0Ms, seg.endDay, 0, order++);
  }

  if (maxDay > 0) {
    pushPoint(points, day0Ms, maxDay, 0, order++);
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
