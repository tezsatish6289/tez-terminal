/**
 * Pure logic for the shared daily-candle store (Firestore-backed).
 *
 * Closed daily bars are immutable, so we persist them once and serve every
 * viewer from the store — Dhan is only hit to backfill missing history or to
 * append newly-closed sessions. The forming (today) bar is never stored; it's
 * merged on read from the live marketfeed snapshot.
 *
 * This module is dependency-light (no Firestore, no `server-only`) so it can be
 * unit-tested directly.
 */

import {
  istDateKeyFromEpochSec,
  istDayStartEpochSec,
  istTodayKey,
  type DailyOhlcCandle,
} from "./daily-candle-live";
import { prevWeekdayKey } from "./intraday-session";

const IST_CLOSE_MIN = 960; // 16:00 IST — a daily bar is "closed" after this.
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Snapshot of a stored series as loaded from Firestore. */
export interface DailyStoreState {
  bars: readonly DailyOhlcCandle[];
  /** Date key of the newest stored (closed) bar we've reconciled through. */
  updatedThrough: string | null;
  /** Wall-clock ms of the last Dhan reconciliation (for holiday backoff). */
  checkedThroughMs: number | null;
  /**
   * Earliest *calendar* date we've fetched history from (the `fromDate` of the
   * widest full fetch, not the oldest trading bar). Comparing the requested
   * window against this avoids spurious full re-fetches caused by leading
   * weekends/holidays shifting the oldest actual bar forward.
   */
  coversFrom: string | null;
}

export type DailyFetchMode = "none" | "tail" | "full";

export interface DailyFetchPlan {
  mode: DailyFetchMode;
  /** Calendar days of history to request from Dhan (0 when mode is "none"). */
  fetchDays: number;
}

/** Date key (IST) of a bar. */
export function dailyBarKey(bar: DailyOhlcCandle): string {
  return istDateKeyFromEpochSec(bar.time);
}

/**
 * Merge incoming daily bars into an existing series: dedupe by IST date key
 * (incoming wins — freshest EOD value), sort ascending, cap to the most recent
 * `capBars`. Pure.
 */
export function mergeDailyBars(
  existing: readonly DailyOhlcCandle[],
  incoming: readonly DailyOhlcCandle[],
  capBars: number,
): DailyOhlcCandle[] {
  const byKey = new Map<string, DailyOhlcCandle>();
  for (const b of existing) if (Number.isFinite(b?.time)) byKey.set(dailyBarKey(b), b);
  for (const b of incoming) if (Number.isFinite(b?.time)) byKey.set(dailyBarKey(b), b);
  const next = [...byKey.values()].sort((a, b) => a.time - b.time);
  return next.length > capBars ? next.slice(next.length - capBars) : next;
}

/**
 * Most recent daily session whose EOD bar should exist. Weekday-based and
 * holiday-agnostic: after 16:00 IST on a weekday it's today, otherwise the
 * previous weekday. Holidays self-heal (Dhan returns no new bar; backoff
 * prevents refetch storms).
 */
export function expectedLastClosedSessionKey(nowMs: number): string {
  const d = new Date(nowMs + IST_OFFSET_MS);
  const dow = d.getUTCDay();
  const minuteOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  const today = istTodayKey(nowMs);
  if (dow >= 1 && dow <= 5 && minuteOfDay >= IST_CLOSE_MIN) return today;
  return prevWeekdayKey(today);
}

/** Keep only bars within the most recent `days` calendar window. Pure. */
export function sliceDailyByDays(
  bars: readonly DailyOhlcCandle[],
  days: number,
  nowMs: number,
): DailyOhlcCandle[] {
  const oldestKey = istDateKeyFromEpochSec(Math.floor((nowMs - days * DAY_MS) / 1000));
  return bars.filter((b) => dailyBarKey(b) >= oldestKey);
}

/**
 * Decide whether/how much to fetch from Dhan for a requested window.
 *
 * - `full`  — store is cold, or doesn't reach far enough back for `days`.
 * - `tail`  — store is missing newly-closed sessions; fetch a small window that
 *             fully covers the gap (never leaves a hole).
 * - `none`  — store already covers the request, or we recently checked and got
 *             nothing new (holiday backoff).
 */
export function planDailyFetch(
  store: DailyStoreState,
  opts: { days: number; nowMs: number; backoffMs: number; tailFloorDays?: number },
): DailyFetchPlan {
  const { days, nowMs, backoffMs } = opts;
  const tailFloorDays = opts.tailFloorDays ?? 10;

  if (!store.bars.length) return { mode: "full", fetchDays: days };

  const requestedOldestKey = istDateKeyFromEpochSec(Math.floor((nowMs - days * DAY_MS) / 1000));
  // Fall back to the oldest bar for legacy docs written before `coversFrom`.
  const coversFrom = store.coversFrom ?? dailyBarKey(store.bars[0]!);
  if (coversFrom > requestedOldestKey) return { mode: "full", fetchDays: days };

  const updatedThrough = store.updatedThrough ?? dailyBarKey(store.bars[store.bars.length - 1]!);
  const expected = expectedLastClosedSessionKey(nowMs);
  if (updatedThrough >= expected) return { mode: "none", fetchDays: 0 };

  // Gap exists — but avoid hammering Dhan on holidays (nothing new to fetch).
  if (store.checkedThroughMs != null && nowMs - store.checkedThroughMs < backoffMs) {
    return { mode: "none", fetchDays: 0 };
  }

  const gapDays = Math.ceil((nowMs - istDayStartEpochSec(updatedThrough) * 1000) / DAY_MS) + 2;
  const fetchDays = Math.min(days, Math.max(tailFloorDays, gapDays));
  return { mode: "tail", fetchDays };
}

/**
 * Widen the persisted coverage start after a fetch of `fetchDays`. Returns the
 * earliest (lexicographically smallest) of the previous coverage and this
 * fetch's `fromDate`, so tail fetches never shrink coverage.
 */
export function widenCoversFrom(
  prev: string | null,
  fetchDays: number,
  nowMs: number,
): string {
  const fetchFromKey = istDateKeyFromEpochSec(Math.floor((nowMs - fetchDays * DAY_MS) / 1000));
  if (prev != null && prev < fetchFromKey) return prev;
  return fetchFromKey;
}

/** Strip live/forming markers and normalize before persisting a closed bar. */
export function sanitizeClosedBar(bar: DailyOhlcCandle): DailyOhlcCandle {
  const out: DailyOhlcCandle = {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
  if (typeof bar.volume === "number" && Number.isFinite(bar.volume)) out.volume = bar.volume;
  return out;
}
