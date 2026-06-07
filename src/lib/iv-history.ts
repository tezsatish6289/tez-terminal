/**
 * Rolling daily ATM-IV history per symbol (indices + F&O stocks).
 *
 * Powers the *self-referential* IV percentile in the volatility-regime engine:
 * "is today's IV high for THIS name?" — the calibration the crypto path can't
 * do for equities because 70% means very different things on a quiet index vs a
 * jumpy midcap. Until ~20 sessions accrue, the engine falls back to a
 * cross-sectional percentile (peers today); this store is what graduates a name
 * to its own history.
 *
 * One doc per symbol (`config/iv_history_{SYMBOL}`) so each compute reads/writes
 * exactly its own series — no 1 MB aggregate-doc risk. Appended at most once per
 * IST trading day (dedup by date key); capped to ~1 trading year.
 *
 * The append/window math is pure + unit-tested; the load/save are thin Firestore
 * wrappers that never throw into their callers.
 */

import type { Firestore } from "firebase-admin/firestore";

export interface IvHistoryEntry {
  /** IST calendar day, `YYYY-MM-DD`. */
  date: string;
  /** ATM implied vol, percent points. */
  iv: number;
}

/** ~1 trading year of daily readings. */
export const IV_HISTORY_CAP = 252;

export function ivHistoryDocId(symbol: string): string {
  return `config/iv_history_${symbol}`;
}

/** IST (UTC+5:30) calendar-day key, stable across a trading session. */
export function istDateKey(now: number): string {
  const ist = new Date(now + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Append today's reading to the series, deduped by date key (idempotent across
 * the many intraday compute passes) and capped to the most recent `cap` days.
 * Pure — returns a new array.
 */
export function appendDailyIv(
  entries: readonly IvHistoryEntry[],
  dateKey: string,
  iv: number,
  cap: number = IV_HISTORY_CAP,
): IvHistoryEntry[] {
  if (!Number.isFinite(iv)) return [...entries];
  if (entries.length && entries[entries.length - 1].date === dateKey) {
    return [...entries]; // already recorded today
  }
  const next = [...entries, { date: dateKey, iv }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface LoadedIvHistory {
  entries: IvHistoryEntry[];
  values: number[];
  lastDate: string | null;
}

/** Load a symbol's IV series; returns empty on any failure. */
export async function loadIvHistory(db: Firestore, symbol: string): Promise<LoadedIvHistory> {
  try {
    const snap = await db.doc(ivHistoryDocId(symbol)).get();
    const raw = snap.data()?.history;
    const entries: IvHistoryEntry[] = Array.isArray(raw)
      ? raw
          .filter(
            (e): e is IvHistoryEntry =>
              e && typeof e.date === "string" && typeof e.iv === "number" && Number.isFinite(e.iv),
          )
          .map((e) => ({ date: e.date, iv: e.iv }))
      : [];
    return {
      entries,
      values: entries.map((e) => e.iv),
      lastDate: entries.length ? entries[entries.length - 1].date : null,
    };
  } catch {
    return { entries: [], values: [], lastDate: null };
  }
}

/**
 * Record today's ATM IV for a symbol if not already stored today. `lastDate`
 * (from a prior {@link loadIvHistory}) avoids a re-read. Best-effort.
 */
export async function recordDailyAtmIv(
  db: Firestore,
  symbol: string,
  atmIv: number | null,
  loaded: LoadedIvHistory,
  now: number = Date.now(),
): Promise<void> {
  if (atmIv == null || !Number.isFinite(atmIv)) return;
  const dateKey = istDateKey(now);
  if (loaded.lastDate === dateKey) return;
  const entries = appendDailyIv(loaded.entries, dateKey, atmIv);
  try {
    await db.doc(ivHistoryDocId(symbol)).set({ history: entries, updatedAt: new Date().toISOString() });
  } catch {
    /* best-effort */
  }
}
