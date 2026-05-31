/**
 * Cumulative FreedomBot user growth — one point per calendar day since
 * the first deployment in scope (Day 0).
 */

export interface PlatformDeploymentRow {
  uid: string;
  bot: string;
  createdAt: string;
}

export interface PlatformUserGrowthPoint {
  /** Days since Day 0 (first deploy in scope). */
  day: number;
  /** Cumulative unique users who had deployed by end of this day. */
  users: number;
  /** UTC calendar date (YYYY-MM-DD) for tooltips. */
  date: string;
}

export interface PlatformUserGrowthSeries {
  day0: string;
  bot: string | null;
  points: PlatformUserGrowthPoint[];
  totalUsers: number;
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
 * @param botFilter Deploy key (CRYPTO, BTC, …) or null for all bots.
 */
export function buildPlatformUserGrowthSeries(
  deployments: PlatformDeploymentRow[],
  botFilter: string | null,
  nowMs: number = Date.now(),
): PlatformUserGrowthSeries | null {
  const filter = botFilter?.trim().toUpperCase() || null;
  const scoped = deployments.filter((d) => {
    if (!d.uid || !d.createdAt) return false;
    if (!filter) return true;
    return String(d.bot).toUpperCase() === filter;
  });

  if (scoped.length === 0) return null;

  const day0Ms = Math.min(
    ...scoped.map((d) => parseMs(d.createdAt)).filter(Number.isFinite),
  );
  if (!Number.isFinite(day0Ms)) return null;

  const firstByUser = new Map<string, number>();
  for (const d of scoped) {
    const ms = parseMs(d.createdAt);
    if (!Number.isFinite(ms)) continue;
    const prev = firstByUser.get(d.uid);
    if (prev == null || ms < prev) firstByUser.set(d.uid, ms);
  }

  if (firstByUser.size === 0) return null;

  const firstDeployDays = [...firstByUser.values()]
    .map((ms) => dayIndex(day0Ms, ms))
    .sort((a, b) => a - b);

  const maxDay = dayIndex(day0Ms, nowMs);
  const points: PlatformUserGrowthPoint[] = [];
  let idx = 0;
  let cumulative = 0;

  for (let day = 0; day <= maxDay; day++) {
    while (idx < firstDeployDays.length && firstDeployDays[idx] <= day) {
      cumulative++;
      idx++;
    }
    points.push({
      day,
      users: cumulative,
      date: utcDateKey(day0Ms + day * MS_PER_DAY),
    });
  }

  return {
    day0: new Date(day0Ms).toISOString(),
    bot: filter,
    points,
    totalUsers: firstByUser.size,
  };
}
