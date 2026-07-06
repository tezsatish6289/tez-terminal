/**
 * Pure logic for the shared intraday (15m) candle store.
 *
 * Mirrors the daily store: closed 15m bars are immutable and served from the
 * shared store; only a short tail is fetched from Dhan to catch newly-closed
 * bars and the single forming (current) bar. The forming bar is never persisted
 * — it's appended on read from the same live fetch (dedup'd by the in-memory
 * 60s cache upstream).
 *
 * Dependency-light (no Firestore, no `server-only`) so it can be unit-tested.
 */

import type { IntradayBoundary } from "./intraday-session";

/** One intraday bar — epoch seconds (UTC), bar-open aligned (matches Dhan). */
export interface IntradayBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IntradayStoreState {
  bars: readonly IntradayBar[];
  /** Start (epoch sec) of the newest stored closed bar. */
  lastClosedSec: number | null;
  /** Earliest epoch sec fetched from (window start of the widest full fetch). */
  coversFromSec: number | null;
  /** Wall-clock ms of the last Dhan reconciliation. */
  checkedThroughMs: number | null;
}

export type IntradayFetchMode = "none" | "tail" | "full";

export interface IntradayFetchPlan {
  mode: IntradayFetchMode;
  /** Calendar days of intraday history to request from Dhan. */
  fetchDays: number;
}

const DAY_SEC = 86_400;

/** Dedupe by bar time (incoming wins), sort ascending, cap to most recent N. */
export function mergeIntradayBars(
  existing: readonly IntradayBar[],
  incoming: readonly IntradayBar[],
  capBars: number,
): IntradayBar[] {
  const byTime = new Map<number, IntradayBar>();
  for (const b of existing) if (Number.isFinite(b?.time)) byTime.set(b.time, b);
  for (const b of incoming) if (Number.isFinite(b?.time)) byTime.set(b.time, b);
  const next = [...byTime.values()].sort((a, b) => a.time - b.time);
  return next.length > capBars ? next.slice(next.length - capBars) : next;
}

/**
 * Split a freshly-fetched intraday series into closed bars (safe to persist)
 * and the single forming bar (present only during the session). A bar is closed
 * when its start is at or before the last-closed bucket; the forming bar is the
 * one strictly after it.
 */
export function splitClosedForming(
  fetched: readonly IntradayBar[],
  boundary: Pick<IntradayBoundary, "inSession" | "lastClosedBucketSec">,
): { closed: IntradayBar[]; forming: IntradayBar | null } {
  const closed = fetched.filter((b) => b.time <= boundary.lastClosedBucketSec);
  let forming: IntradayBar | null = null;
  if (boundary.inSession) {
    const after = fetched.filter((b) => b.time > boundary.lastClosedBucketSec);
    forming = after.length ? after[after.length - 1]! : null;
  }
  return { closed, forming };
}

/** Widen persisted coverage after a fetch (tail never shrinks it). */
export function widenCoversFromSec(
  prev: number | null,
  fetchDays: number,
  nowMs: number,
): number {
  const fromSec = Math.floor(nowMs / 1000) - fetchDays * DAY_SEC;
  if (prev != null && prev < fromSec) return prev;
  return fromSec;
}

/** Keep only bars within the most recent `days` window. Pure. */
export function sliceIntradayByDays(
  bars: readonly IntradayBar[],
  days: number,
  nowMs: number,
): IntradayBar[] {
  const fromSec = Math.floor(nowMs / 1000) - days * DAY_SEC;
  return bars.filter((b) => b.time >= fromSec);
}

/**
 * Decide whether/how much to fetch from Dhan:
 * - `full` — cold store, or coverage doesn't reach back `lookbackDays`.
 * - `tail` — in-session (need the forming bar) or behind on closed bars; fetch
 *            a small window that fully covers the gap.
 * - `none` — market closed and the store is already caught up (zero Dhan calls).
 */
export function planIntradayFetch(
  store: IntradayStoreState,
  boundary: Pick<IntradayBoundary, "inSession" | "lastClosedBucketSec">,
  opts: { nowMs: number; lookbackDays: number; tailFloorDays?: number },
): IntradayFetchPlan {
  const tailFloorDays = opts.tailFloorDays ?? 2;
  if (!store.bars.length) return { mode: "full", fetchDays: opts.lookbackDays };

  const nowSec = Math.floor(opts.nowMs / 1000);
  const windowStartSec = nowSec - opts.lookbackDays * DAY_SEC;
  const covers = store.coversFromSec ?? store.bars[0]!.time;
  if (covers > windowStartSec) return { mode: "full", fetchDays: opts.lookbackDays };

  const needForming = boundary.inSession;
  const behind = store.lastClosedSec == null || store.lastClosedSec < boundary.lastClosedBucketSec;
  if (!needForming && !behind) return { mode: "none", fetchDays: 0 };

  const anchorSec = store.lastClosedSec ?? windowStartSec;
  const gapDays = Math.ceil((nowSec - anchorSec) / DAY_SEC) + 1;
  const fetchDays = Math.min(opts.lookbackDays, Math.max(tailFloorDays, gapDays));
  return { mode: "tail", fetchDays };
}
