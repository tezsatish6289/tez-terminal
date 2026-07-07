/**
 * GCS bhavcopy cache fillers — the only code that talks to NSE for OI history.
 *
 *   • cacheBhavcopyRange  — one-time backfill: page trading days backward and
 *     cache each day's zip + compact all-symbol snapshot into GCS. One fetch per
 *     DATE covers every index + stock, so 120 days ≈ 120 NSE calls total.
 *   • cacheRecentBhavcopy — the daily "cron only fetches bhavcopy" job: ensure
 *     the most recent sessions are cached (catch-up after a missed run).
 *
 * Per-symbol history docs are materialized lazily by `ensureOiHistory` when a
 * chart opens — these fillers never write per-symbol docs.
 */

import "server-only";
import { getNseCookies } from "@/lib/nse-session";
import { ensureBhavcopyCached } from "@/lib/oi-bhavcopy-store";
import { lastCompletedTradingSession } from "@/lib/oi-history-ensure";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function keyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekendDate(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

function parseKey(raw: string | null | undefined): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
  return new Date();
}

export interface CacheBhavcopyRangeOptions {
  /** Start scanning on/just-before this date (default today). */
  before?: string | null;
  /** Trading days (successful caches) to add this call. */
  maxTradingDays?: number;
  /** Hard cap on calendar days scanned (weekends/holidays included). */
  maxCalendarScan?: number;
  delayMs?: number;
}

export interface CacheBhavcopyRangeResult {
  added: number;
  alreadyCached: number;
  holidaysSkipped: number;
  /** Days that errored (network) after retries — left uncached, retried next run. */
  failed: number;
  scannedFrom: string;
  scannedTo: string;
  /** Earliest date reached — pass as `before` next call to page deeper. */
  earliestDate: string | null;
}

/**
 * Cache a chunk of trading days into GCS, paging backward from `before`.
 * Idempotent — days already cached are counted and skipped (no NSE re-fetch).
 */
export async function cacheBhavcopyRange(
  opts: CacheBhavcopyRangeOptions = {},
): Promise<CacheBhavcopyRangeResult> {
  const maxTradingDays = Math.max(1, Math.min(opts.maxTradingDays ?? 15, 60));
  const maxCalendarScan = opts.maxCalendarScan ?? Math.ceil(maxTradingDays * 2.2);
  const delayMs = opts.delayMs ?? 250;

  const cookies = await getNseCookies().catch(() => "");
  const cursor = parseKey(opts.before ?? null);
  const scannedTo = keyOf(cursor);

  let added = 0;
  let alreadyCached = 0;
  let holidaysSkipped = 0;
  let failed = 0;
  let scanned = 0;
  let earliest: Date | null = null;

  const day = new Date(cursor);
  while (added + alreadyCached < maxTradingDays && scanned < maxCalendarScan) {
    earliest = new Date(day);
    scanned++;
    if (!isWeekendDate(day)) {
      try {
        const res = await ensureBhavcopyCached(keyOf(day), cookies);
        if (res.alreadyHad) alreadyCached++;
        else if (res.cached) added++;
        else holidaysSkipped++; // 404 → non-trading day
        if (!res.alreadyHad) await sleep(delayMs);
      } catch {
        // Persistent network failure for this day — leave it uncached and keep
        // going; a later run re-attempts it (it won't be marked cached). Don't
        // count toward maxTradingDays so the chunk still makes real progress.
        failed++;
        await sleep(delayMs);
      }
    }
    day.setUTCDate(day.getUTCDate() - 1);
  }

  return {
    added,
    alreadyCached,
    holidaysSkipped,
    failed,
    scannedFrom: earliest ? keyOf(earliest) : scannedTo,
    scannedTo,
    earliestDate: earliest ? keyOf(earliest) : null,
  };
}

export interface CacheRecentResult {
  cached: string[];
  alreadyCached: string[];
  missing: string[];
}

/**
 * Daily cron job: ensure the most recent completed sessions are cached in GCS.
 * Walks back from the last completed session, stopping once it hits a day that's
 * already cached (older days are assumed done) or after `maxDays` trading days.
 */
export async function cacheRecentBhavcopy(
  maxDays = 5,
  now: number = Date.now(),
): Promise<CacheRecentResult> {
  const cookies = await getNseCookies().catch(() => "");
  const cached: string[] = [];
  const alreadyCached: string[] = [];
  const missing: string[] = [];

  let key = lastCompletedTradingSession(now);
  let tradingDaysScanned = 0;
  let guard = 0;
  // Scan back `maxDays` trading sessions regardless of whether the newest day
  // is already cached — a gap (e.g. Jul 3–5 missing but Jul 6 present) must
  // not short-circuit on the first `alreadyHad`.
  while (tradingDaysScanned < maxDays && guard < maxDays * 4) {
    guard++;
    const d = new Date(`${key}T00:00:00Z`);
    if (!isWeekendDate(d)) {
      tradingDaysScanned++;
      const res = await ensureBhavcopyCached(key, cookies);
      if (res.alreadyHad) alreadyCached.push(key);
      else if (res.cached) cached.push(key);
      else missing.push(key); // holiday / not yet published
    }
    d.setUTCDate(d.getUTCDate() - 1);
    key = keyOf(d);
  }

  return { cached, alreadyCached, missing };
}
