/**
 * Event-driven OI history materialization for a single symbol (index or stock).
 *
 * Called when a History chart opens. Self-healing + scale-safe:
 *   • skip-if-fresh — if the series already covers the last completed session
 *     (or we've reconciled that far), do NOTHING and touch no storage beyond one
 *     Firestore read.
 *   • otherwise fill the gap from the GCS daily-snapshot cache (no NSE), with a
 *     small NSE backstop only for tiny incremental gaps.
 *
 * Cold start (no series yet) is filled from the GCS snapshot cache, so it relies
 * on the one-time bhavcopy backfill having populated GCS. We never fan out into
 * dozens of live NSE calls inside a single request.
 */

import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getDailySnapshot } from "@/lib/oi-bhavcopy-store";
import {
  loadOiHistory,
  markOiHistoryCheckedThrough,
  mergeOiSnapshots,
  saveOiHistory,
  type OiHistoryEntry,
} from "@/lib/oi-history";

const IST_OFFSET_MS = 5.5 * 3600_000;
/** Bhavcopy is reliably published well before this IST minute-of-day. */
const PUBLISH_CUTOFF_MIN = 18 * 60; // 6:00 PM IST
/** Max trading days to fill in one incremental (warm) request. */
const MAX_INCREMENTAL_DAYS = 7;
/** Max weekdays to probe on a cold start (≈6 months of sessions). */
const MAX_COLD_PROBES = 130;
/** Bail a cold start after this many consecutive empty probes (symbol not backfilled). */
const COLD_MISS_BAIL = 6;

function istDate(now: number): Date {
  return new Date(now + IST_OFFSET_MS);
}

function keyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return keyOf(d);
}

function isWeekend(dateKey: string): boolean {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * The most recent trading session whose bhavcopy we'd expect to exist.
 * Best-effort (holidays handled downstream by an absent snapshot). Pure.
 */
export function lastCompletedTradingSession(now: number = Date.now()): string {
  const ist = istDate(now);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  let key = keyOf(ist);
  // Today's file isn't out yet before the publish cutoff → step to yesterday.
  if (mins < PUBLISH_CUTOFF_MIN) key = addDaysKey(key, -1);
  // Walk back over weekends.
  while (isWeekend(key)) key = addDaysKey(key, -1);
  return key;
}

/** Weekday keys in (lastDate, expected], oldest→newest, capped. */
function incrementalDates(lastDate: string, expected: string, cap: number): string[] {
  const out: string[] = [];
  let cursor = addDaysKey(lastDate, 1);
  while (cursor <= expected && out.length < cap) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return out;
}

export interface EnsureOiHistoryResult {
  entries: OiHistoryEntry[];
  lastDate: string | null;
  added: number;
  /** True when nothing needed doing (already current). */
  fresh: boolean;
  /** True when the symbol had no series and the cache couldn't seed it. */
  needsBackfill: boolean;
}

/**
 * Ensure `config/oi_history_{symbol}` covers the latest completed session, filling
 * gaps from the GCS daily-snapshot cache. Returns the (possibly updated) series.
 */
export async function ensureOiHistory(
  db: Firestore,
  symbol: string,
  now: number = Date.now(),
): Promise<EnsureOiHistoryResult> {
  const sym = symbol.toUpperCase();
  const loaded = await loadOiHistory(db, sym);
  const expected = lastCompletedTradingSession(now);

  const isFresh =
    (loaded.checkedThrough != null && loaded.checkedThrough >= expected) ||
    (loaded.lastDate != null && loaded.lastDate >= expected);

  if (isFresh) {
    return {
      entries: loaded.entries,
      lastDate: loaded.lastDate,
      added: 0,
      fresh: true,
      needsBackfill: false,
    };
  }

  const batch: OiHistoryEntry[] = [];

  if (loaded.lastDate) {
    // Warm path — small forward gap. GCS first; tiny NSE backstop allowed.
    const dates = incrementalDates(loaded.lastDate, expected, MAX_INCREMENTAL_DAYS);
    for (const dateKey of dates) {
      const map = await getDailySnapshot(dateKey, { allowNse: true });
      const snap = map?.[sym];
      if (snap) batch.push(snap);
    }
  } else {
    // Cold start — fill backward from the GCS cache only (no NSE fan-out).
    let cursor = expected;
    let probes = 0;
    let consecutiveMisses = 0;
    while (probes < MAX_COLD_PROBES && consecutiveMisses < COLD_MISS_BAIL) {
      if (!isWeekend(cursor)) {
        probes++;
        const map = await getDailySnapshot(cursor, { allowNse: false });
        const snap = map?.[sym];
        if (snap) {
          batch.push(snap);
          consecutiveMisses = 0;
        } else {
          consecutiveMisses++;
        }
      }
      cursor = addDaysKey(cursor, -1);
    }
  }

  if (!batch.length) {
    // Nothing to add. Only mark fresh if we already had data (a true holiday gap);
    // a cold-empty symbol stays unmarked so a later backfill can seed it.
    if (loaded.lastDate) {
      await markOiHistoryCheckedThrough(db, sym, expected);
      return {
        entries: loaded.entries,
        lastDate: loaded.lastDate,
        added: 0,
        fresh: true,
        needsBackfill: false,
      };
    }
    return {
      entries: [],
      lastDate: null,
      added: 0,
      fresh: false,
      needsBackfill: true,
    };
  }

  const merged = mergeOiSnapshots(loaded.entries, batch);
  await saveOiHistory(db, sym, merged, { checkedThrough: expected });

  return {
    entries: merged,
    lastDate: merged[merged.length - 1]?.date ?? loaded.lastDate,
    added: batch.length,
    fresh: false,
    needsBackfill: false,
  };
}
