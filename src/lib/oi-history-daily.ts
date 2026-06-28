/**
 * Daily OI-wall history append — one bhavcopy fetch per trading day, all indices.
 *
 * Called by `/api/cron/oi-history?append=1` after EOD bhavcopy publish (~4:30 PM IST).
 * Fills any gap since the last stored date (weekend/holiday cron misses included).
 * Initial 120-day history still comes from `backfillOiHistory` — this only forward-fills.
 */

import type { Firestore } from "firebase-admin/firestore";
import { INDEX_KEYS, type IndexKey } from "@/lib/index-specs";
import { getNseCookies } from "@/lib/nse-session";
import {
  computeOiSnapshot,
  fetchFoBhavcopyCsv,
  parseFoBhavcopyCsv,
  type FoOptionRow,
} from "@/lib/nse/fo-bhavcopy";
import {
  istDateKey,
  loadOiHistory,
  mergeOiSnapshots,
  saveOiHistory,
  type OiHistoryEntry,
} from "@/lib/oi-history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function utcDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function nextDateKey(key: string): string {
  const d = utcDateFromKey(key);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface AppendDailyOiOptions {
  /** Default: all five NSE index symbols. */
  symbols?: readonly IndexKey[];
  /** Max trading days to append per symbol per run (catch-up cap). */
  maxDaysPerSymbol?: number;
  delayMs?: number;
}

export interface AppendSymbolResult {
  appended: string[];
  skippedReason?: "needs_backfill" | "up_to_date";
  lastDate: string | null;
  totalPoints: number;
}

export interface AppendDailyOiResult {
  symbols: Record<string, AppendSymbolResult>;
  /** Date keys for which a bhavcopy was fetched this run. */
  datesFetched: string[];
}

/** Collect IST date keys strictly after `lastDate` up to `todayKey`. Pure. */
export function datesToFillSince(
  lastDate: string | null,
  todayKey: string,
  maxDays: number,
): string[] {
  if (!lastDate) return [];
  const out: string[] = [];
  let cursor = nextDateKey(lastDate);
  while (cursor <= todayKey && out.length < maxDays) {
    out.push(cursor);
    cursor = nextDateKey(cursor);
  }
  return out;
}

/**
 * Append missing EOD OI-wall points for index symbols. Idempotent — safe to rerun.
 */
export async function appendDailyOiHistory(
  db: Firestore,
  opts: AppendDailyOiOptions = {},
): Promise<AppendDailyOiResult> {
  const symbols = (opts.symbols ?? INDEX_KEYS).map((s) => s.toUpperCase());
  const maxDaysPerSymbol = Math.max(1, Math.min(opts.maxDaysPerSymbol ?? 5, 14));
  const delayMs = opts.delayMs ?? 250;

  const cookies = await getNseCookies().catch(() => "");
  const todayKey = istDateKey(Date.now());

  const loaded = await Promise.all(
    symbols.map(async (symbol) => ({ symbol, ...(await loadOiHistory(db, symbol)) })),
  );

  const datesNeeded = new Set<string>();
  for (const row of loaded) {
    if (!row.lastDate) continue;
    for (const d of datesToFillSince(row.lastDate, todayKey, maxDaysPerSymbol)) {
      datesNeeded.add(d);
    }
  }

  const sortedDates = [...datesNeeded].sort();
  const csvCache = new Map<string, FoOptionRow[]>();

  for (const dateKey of sortedDates) {
    const d = utcDateFromKey(dateKey);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    try {
      const csv = await fetchFoBhavcopyCsv(d, cookies);
      if (csv) csvCache.set(dateKey, parseFoBhavcopyCsv(csv));
    } catch (e) {
      console.warn(
        `[oi-daily] bhavcopy ${dateKey} failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
    await sleep(delayMs);
  }

  const symbolResults: Record<string, AppendSymbolResult> = {};

  for (const row of loaded) {
    const { symbol, entries, lastDate } = row;
    if (!lastDate) {
      symbolResults[symbol] = {
        appended: [],
        skippedReason: "needs_backfill",
        lastDate: null,
        totalPoints: entries.length,
      };
      continue;
    }

    const want = datesToFillSince(lastDate, todayKey, maxDaysPerSymbol);
    const batch: OiHistoryEntry[] = [];
    for (const dateKey of want) {
      const parsed = csvCache.get(dateKey);
      if (!parsed) continue;
      const snap = computeOiSnapshot(parsed, symbol, dateKey);
      if (snap) batch.push(snap);
    }

    if (!batch.length) {
      symbolResults[symbol] = {
        appended: [],
        skippedReason: want.length ? undefined : "up_to_date",
        lastDate,
        totalPoints: entries.length,
      };
      continue;
    }

    const merged = mergeOiSnapshots(entries, batch);
    await saveOiHistory(db, symbol, merged);
    symbolResults[symbol] = {
      appended: batch.map((b) => b.date),
      lastDate: merged[merged.length - 1]?.date ?? lastDate,
      totalPoints: merged.length,
    };
  }

  return { symbols: symbolResults, datesFetched: [...csvCache.keys()].sort() };
}
