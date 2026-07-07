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
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { getDailySnapshot } from "@/lib/oi-bhavcopy-store";
import { mapWithConcurrency } from "@/lib/async-pool";
import {
  coldProbeDates,
  incrementalOiHistoryDates,
  isOiHistorySeriesFresh,
  lastCompletedTradingSession,
} from "@/lib/oi-history-ensure-core";
export {
  coldProbeDates,
  isOiHistorySeriesFresh,
  lastCompletedTradingSession,
} from "@/lib/oi-history-ensure-core";
import {
  loadOiHistory,
  mergeOiSnapshots,
  saveOiHistory,
  type OiHistoryEntry,
} from "@/lib/oi-history";

/** Max trading days to fill in one incremental (warm) request. */
const MAX_INCREMENTAL_DAYS = 7;
/** Max weekdays to probe on a cold start (≈6 months of sessions). */
const MAX_COLD_PROBES = 130;
/** Parallel GCS reads when filling gaps — day files are shared across symbols. */
const OI_ENSURE_CONCURRENCY = 8;

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

  const isFresh = isOiHistorySeriesFresh(loaded.lastDate, expected);

  if (isFresh) {
    return {
      entries: loaded.entries,
      lastDate: loaded.lastDate,
      added: 0,
      fresh: true,
      needsBackfill: false,
    };
  }

  // Which sessions to pull. Warm = the small forward gap; cold = the recent
  // window the chart shows. Either way we read GCS ONLY — never NSE on a chart
  // open (the daily cron is the sole NSE fetcher). Day files are shared across
  // symbols and memoized in-process, so the first open warms the rest.
  const dates = loaded.lastDate
    ? incrementalOiHistoryDates(loaded.lastDate, expected, MAX_INCREMENTAL_DAYS)
    : coldProbeDates(expected, MAX_COLD_PROBES);

  const maps = await mapWithConcurrency(dates, OI_ENSURE_CONCURRENCY, (dateKey) =>
    getDailySnapshot(dateKey, { allowNse: false }),
  );

  const batch: OiHistoryEntry[] = [];
  for (const map of maps) {
    const snap = map?.[sym];
    if (snap) batch.push(snap);
  }

  if (!batch.length) {
    // Nothing to add. Never mark `checkedThrough` past `lastDate` when the
    // series still ends before `expected` — an empty batch usually means GCS
    // hasn't cached those sessions yet (cron gap), not a holiday-only gap.
    // Leaving the doc un-reconciled lets the next chart open / cron warm retry.
    if (loaded.lastDate) {
      return {
        entries: loaded.entries,
        lastDate: loaded.lastDate,
        added: 0,
        fresh: isOiHistorySeriesFresh(loaded.lastDate, expected),
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

const OI_HISTORY_DOC_PREFIX = "oi_history_";
/** Symbols warmed per batch by the daily cron. */
const OI_WARM_CONCURRENCY = 8;

export interface WarmOiHistoriesResult {
  symbols: number;
  updated: number;
  fresh: number;
}

/**
 * Pre-materialize every already-seeded symbol's OI series up to the latest
 * completed session, so a chart open is a single Firestore read (never GCS
 * probing). Meant to run in the daily cron *after* the bhavcopy is cached to
 * GCS; reuses `ensureOiHistory` (GCS-only, memoized) so day files are read once
 * and shared across all symbols. New/unseeded symbols are left to the (now-fast)
 * lazy build on first open.
 */
export async function warmExistingOiHistories(
  db: Firestore,
  now: number = Date.now(),
): Promise<WarmOiHistoriesResult> {
  // Range-scan the `config` collection for `oi_history_*` doc IDs only.
  const snap = await db
    .collection("config")
    .where(FieldPath.documentId(), ">=", OI_HISTORY_DOC_PREFIX)
    .where(FieldPath.documentId(), "<", `${OI_HISTORY_DOC_PREFIX}\uf8ff`)
    .select()
    .get();

  const symbols = snap.docs
    .map((d) => d.id.slice(OI_HISTORY_DOC_PREFIX.length))
    .filter((s) => s.length > 0);

  const results = await mapWithConcurrency(symbols, OI_WARM_CONCURRENCY, (symbol) =>
    ensureOiHistory(db, symbol, now).catch(() => null),
  );

  let updated = 0;
  let fresh = 0;
  for (const r of results) {
    if (!r) continue;
    if (r.added > 0) updated++;
    else if (r.fresh) fresh++;
  }
  return { symbols: symbols.length, updated, fresh };
}
