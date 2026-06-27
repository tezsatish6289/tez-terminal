/**
 * Rolling OI-wall history per symbol — the data behind the levels "History mode"
 * chart (put wall / call wall / max pain over time).
 *
 * One point per IST trading day (EOD), wall-following: each row stores whatever
 * strike was the dominant put / call wall that day, so a wall *moving* (24000 →
 * 23900) is captured as the strike label changing on its own continuous line —
 * never a gap. Mirrors the `iv-history` store: one doc per symbol
 * (`config/oi_history_{SYMBOL}`) so each read/write touches only its own series
 * (no 1 MB aggregate-doc risk), deduped by date key and capped to ~1.5y.
 *
 * Backfilled from NSE F&O bhavcopy archives (EOD OI per strike) so a fresh symbol
 * has real history immediately; the live cron appends today's point going forward.
 *
 * The append/window math is pure + unit-testable; load/save are thin Firestore
 * wrappers that never throw into their callers.
 */

import type { Firestore } from "firebase-admin/firestore";

export interface OiHistoryEntry {
  /** IST calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Underlying close that day (NSE `UndrlygPric`), null if unknown. */
  spot: number | null;
  /** Dominant put-wall strike (highest put OI below spot). */
  putStrike: number | null;
  /** Open interest at the put wall. */
  putOI: number | null;
  /** Dominant call-wall strike (highest call OI above spot). */
  callStrike: number | null;
  /** Open interest at the call wall. */
  callOI: number | null;
  /** Max-pain strike across the chain. */
  maxPain: number | null;
  /** Expiry these walls were read from (`YYYY-MM-DD`). */
  expiry: string | null;
}

/** ~1.5 trading years of daily points (well under Firestore's 1 MB doc cap). */
export const OI_HISTORY_CAP = 400;

export function oiHistoryDocId(symbol: string): string {
  return `config/oi_history_${symbol.toUpperCase()}`;
}

/** IST (UTC+5:30) calendar-day key, stable across a trading session. */
export function istDateKey(now: number): string {
  const ist = new Date(now + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}

function isValidEntry(e: unknown): e is OiHistoryEntry {
  return (
    !!e &&
    typeof (e as OiHistoryEntry).date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test((e as OiHistoryEntry).date)
  );
}

/**
 * Append one daily point, deduped by date key (idempotent across the many
 * intraday compute passes — last write wins for the same day), kept sorted
 * ascending and capped to the most recent `cap` days. Pure.
 */
export function appendOiSnapshot(
  entries: readonly OiHistoryEntry[],
  entry: OiHistoryEntry,
  cap: number = OI_HISTORY_CAP,
): OiHistoryEntry[] {
  if (!isValidEntry(entry)) return [...entries];
  const byDate = new Map<string, OiHistoryEntry>();
  for (const e of entries) if (isValidEntry(e)) byDate.set(e.date, e);
  byDate.set(entry.date, entry); // last write wins on same-day re-append
  const next = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Merge a batch of daily points (backfill) into an existing series. Pure. */
export function mergeOiSnapshots(
  entries: readonly OiHistoryEntry[],
  batch: readonly OiHistoryEntry[],
  cap: number = OI_HISTORY_CAP,
): OiHistoryEntry[] {
  let acc = entries.filter(isValidEntry);
  for (const e of batch) acc = appendOiSnapshot(acc, e, cap);
  return acc;
}

export interface LoadedOiHistory {
  entries: OiHistoryEntry[];
  lastDate: string | null;
}

/** Load a symbol's OI-wall series; returns empty on any failure. */
export async function loadOiHistory(db: Firestore, symbol: string): Promise<LoadedOiHistory> {
  try {
    const snap = await db.doc(oiHistoryDocId(symbol)).get();
    const raw = snap.data()?.history;
    const entries: OiHistoryEntry[] = Array.isArray(raw) ? raw.filter(isValidEntry) : [];
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return { entries, lastDate: entries.length ? entries[entries.length - 1].date : null };
  } catch {
    return { entries: [], lastDate: null };
  }
}

/** Persist a symbol's OI-wall series. Best-effort (never throws into caller). */
export async function saveOiHistory(
  db: Firestore,
  symbol: string,
  entries: readonly OiHistoryEntry[],
): Promise<void> {
  try {
    await db.doc(oiHistoryDocId(symbol)).set({
      symbol: symbol.toUpperCase(),
      history: entries,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
}
