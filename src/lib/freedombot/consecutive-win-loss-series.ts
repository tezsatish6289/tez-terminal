/**
 * Consecutive win / loss streak — one point per completed episode.
 *
 * Example: (day 0, 0) → (day 5, +5) → (day 7, −2) → (day 10, +4)
 * Linear segments between episodes show win runs climbing and loss runs
 * dipping, with streak flips visible as diagonal crossings.
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
  /** Signed streak length at end of this episode (+ wins, − losses). */
  streak: number;
  /** UTC calendar date (YYYY-MM-DD) for tooltips. */
  date: string;
  /** Sort key when multiple episodes share the same day. */
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

function pushEpisode(
  points: ConsecutiveWinLossPoint[],
  day0Ms: number,
  day: number,
  streak: number,
  order: number,
): number {
  if (streak === 0) return order;
  const prev = points[points.length - 1];
  if (prev?.day === day && prev.streak === streak) return order;
  points.push({
    day,
    streak,
    date: utcDateKey(day0Ms, day),
    order,
  });
  return order + 1;
}

/**
 * Build sparse episode series — one marker per completed win/loss run.
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
  const points: ConsecutiveWinLossPoint[] = [
    { day: 0, streak: 0, date: utcDateKey(day0Ms, 0), order: 0 },
  ];
  let order = 1;
  let winStreak = 0;
  let lossStreak = 0;
  let lastWinDay = 0;
  let lastLossDay = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  const flushWinEpisode = () => {
    if (winStreak <= 0) return;
    order = pushEpisode(points, day0Ms, lastWinDay, winStreak, order);
    winStreak = 0;
  };

  const flushLossEpisode = () => {
    if (lossStreak <= 0) return;
    order = pushEpisode(points, day0Ms, lastLossDay, -lossStreak, order);
    lossStreak = 0;
  };

  for (const t of closed) {
    const closeMs = parseMs(t.closedAt!);
    if (!Number.isFinite(closeMs)) continue;
    const day = dayIndex(day0Ms, closeMs);
    const pnl = t.realizedPnl ?? 0;

    if (pnl > 0) {
      if (lossStreak > 0) flushLossEpisode();
      winStreak += 1;
      lastWinDay = day;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (pnl < 0) {
      if (winStreak > 0) flushWinEpisode();
      lossStreak += 1;
      lastLossDay = day;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }

  flushWinEpisode();
  flushLossEpisode();

  const last = points[points.length - 1];
  const currentStreak = last?.streak ?? 0;

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
