/**
 * IST market-session boundary math for 15-minute intraday bars.
 *
 * Session: 09:15 → 16:00 IST (per product decision — a little past the 15:30
 * NSE close so the final bar is fully settled). Bars are 15m, aligned to 09:15:
 * 09:15, 09:30, …, 15:45. The 15:45 bar closes at 16:00.
 *
 * Pure + holiday-agnostic: boundaries are computed from the wall clock only.
 * Holidays are handled downstream (a gap-fill fetch simply returns no new bar
 * and the store self-heals), so this module never needs a holiday calendar.
 */

import { istDateKeyFromEpochSec, istDayStartEpochSec } from "./daily-candle-live";

export const SESSION_OPEN_MIN = 555; // 09:15 IST (9*60 + 15)
export const SESSION_CLOSE_MIN = 960; // 16:00 IST (16*60)
export const BAR_MIN = 15;
/** Start minute of the final 15m bar (15:45 → closes at 16:00). */
export const LAST_BAR_OPEN_MIN = SESSION_CLOSE_MIN - BAR_MIN;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IstParts {
  /** IST calendar date, YYYY-MM-DD. */
  key: string;
  /** Minutes since IST midnight (0–1439). */
  minuteOfDay: number;
  /** Day of week in IST: 0=Sun … 6=Sat. */
  dow: number;
}

/** Decompose an instant into IST calendar parts. */
export function istParts(nowMs: number): IstParts {
  const d = new Date(nowMs + IST_OFFSET_MS);
  return {
    key: d.toISOString().slice(0, 10),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

function isWeekdayDow(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}

/** Epoch seconds for a given IST minute-of-day on a date key. */
export function istEpochSec(dateKey: string, minuteOfDay: number): number {
  return istDayStartEpochSec(dateKey) + minuteOfDay * 60;
}

/**
 * Most recent weekday date key strictly before `key`. Holiday-agnostic — a
 * holiday simply yields no data downstream and the store retries.
 */
export function prevWeekdayKey(key: string): string {
  let ms = istDayStartEpochSec(key) * 1000;
  do {
    ms -= DAY_MS;
  } while (!isWeekdayDow(new Date(ms + IST_OFFSET_MS).getUTCDay()));
  return istDateKeyFromEpochSec(Math.floor(ms / 1000));
}

export interface IntradayBoundary {
  /** True while the market is open (09:15 ≤ now < 16:00 on a weekday). */
  inSession: boolean;
  /** Forming 15m bar's start (epoch sec); null outside the session. */
  curBucketStartSec: number | null;
  /** Most recent fully-closed 15m bar's start (epoch sec). Always set. */
  lastClosedBucketSec: number;
  /** IST date key of `now`. */
  todayKey: string;
}

/**
 * Resolve the current forming bar and the last fully-closed bar for a 15m
 * intraday series, aligned to the 09:15–16:00 IST session.
 */
export function intradayBarBoundary(nowMs: number): IntradayBoundary {
  const { key, minuteOfDay, dow } = istParts(nowMs);
  const weekday = isWeekdayDow(dow);
  const inSession =
    weekday && minuteOfDay >= SESSION_OPEN_MIN && minuteOfDay < SESSION_CLOSE_MIN;

  const prevSessionLastClosed = () => istEpochSec(prevWeekdayKey(key), LAST_BAR_OPEN_MIN);

  if (inSession) {
    const idx = Math.floor((minuteOfDay - SESSION_OPEN_MIN) / BAR_MIN);
    const curStartMin = SESSION_OPEN_MIN + idx * BAR_MIN;
    return {
      inSession: true,
      curBucketStartSec: istEpochSec(key, curStartMin),
      // First bar of the day → last close is the previous session's 15:45 bar.
      lastClosedBucketSec:
        idx === 0 ? prevSessionLastClosed() : istEpochSec(key, curStartMin - BAR_MIN),
      todayKey: key,
    };
  }

  // Outside the session.
  const lastClosedBucketSec =
    weekday && minuteOfDay >= SESSION_CLOSE_MIN
      ? istEpochSec(key, LAST_BAR_OPEN_MIN) // after today's close
      : prevSessionLastClosed(); // pre-open today, or weekend

  return { inSession: false, curBucketStartSec: null, lastClosedBucketSec, todayKey: key };
}

/**
 * True when a stored 15m series is missing at least one closed bar (i.e. the
 * latest stored bar predates the last closed bucket, or nothing is stored).
 */
export function missingClosedBars(
  lastStoredBarStartSec: number | null | undefined,
  boundary: Pick<IntradayBoundary, "lastClosedBucketSec">,
): boolean {
  if (lastStoredBarStartSec == null) return true;
  return lastStoredBarStartSec < boundary.lastClosedBucketSec;
}
