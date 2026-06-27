/**
 * Server-side backfill for the OI-wall history series.
 *
 * Walks NSE F&O bhavcopy archives backwards from a cursor date, computes one
 * daily put/call-wall + max-pain snapshot per trading day, and merges them into
 * `config/oi_history_{SYMBOL}`. Processes a bounded number of trading days per
 * call (so each request stays under the cron timeout) and returns the earliest
 * date reached, so the trigger script can page deeper across multiple calls.
 *
 * Runs server-side only — the archive host geo-blocks datacenter IPs, so this
 * relies on the same `NSE_HTTPS_PROXY` egress as the live option-chain fetch.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getNseCookies } from "@/lib/nse-session";
import {
  computeOiSnapshot,
  fetchFoBhavcopyCsv,
  parseFoBhavcopyCsv,
} from "@/lib/nse/fo-bhavcopy";
import {
  loadOiHistory,
  mergeOiSnapshots,
  saveOiHistory,
  type OiHistoryEntry,
} from "@/lib/oi-history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Treat the date in UTC; bhavcopy is published per IST trading day. */
function parseDateParam(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
  return new Date();
}

export interface BackfillOiOptions {
  symbol: string;
  /** Start scanning on/just-before this date (default: today). */
  before?: string | null;
  /** Max trading days (successful bhavcopy fetches) to add this call. */
  maxTradingDays?: number;
  /** Hard cap on calendar days scanned this call (weekends/holidays included). */
  maxCalendarScan?: number;
  /** Delay between archive fetches (politeness). */
  delayMs?: number;
}

export interface BackfillOiResult {
  symbol: string;
  added: number;
  tradingDaysFound: number;
  holidaysSkipped: number;
  scannedFrom: string;
  scannedTo: string;
  /** Earliest date reached — pass as `before` next call to page deeper. */
  earliestDate: string | null;
  totalPoints: number;
  sample: OiHistoryEntry[];
}

/**
 * Backfill one chunk for `symbol`. Idempotent: re-running over the same dates
 * just overwrites those days (merge dedups by date key).
 */
export async function backfillOiHistory(
  db: Firestore,
  opts: BackfillOiOptions,
): Promise<BackfillOiResult> {
  const symbol = opts.symbol.toUpperCase();
  const maxTradingDays = Math.max(1, Math.min(opts.maxTradingDays ?? 60, 300));
  const maxCalendarScan = opts.maxCalendarScan ?? Math.ceil(maxTradingDays * 2.2);
  const delayMs = opts.delayMs ?? 250;

  const cookies = await getNseCookies().catch(() => "");

  const cursor = parseDateParam(opts.before ?? null);
  const scannedTo = dateKey(cursor);
  const found: OiHistoryEntry[] = [];
  let holidaysSkipped = 0;
  let earliest: Date | null = null;
  let scanned = 0;

  const day = new Date(cursor);
  while (found.length < maxTradingDays && scanned < maxCalendarScan) {
    earliest = new Date(day);
    scanned++;
    const dow = day.getUTCDay(); // 0 Sun, 6 Sat
    if (dow !== 0 && dow !== 6) {
      try {
        const csv = await fetchFoBhavcopyCsv(day, cookies);
        if (csv) {
          const rows = parseFoBhavcopyCsv(csv);
          const snap = computeOiSnapshot(rows, symbol, dateKey(day));
          if (snap) found.push(snap);
          else holidaysSkipped++; // file present but symbol absent (rare)
        } else {
          holidaysSkipped++; // 404 → holiday
        }
      } catch (e) {
        console.warn(
          `[oi-backfill] ${symbol} ${dateKey(day)} failed:`,
          e instanceof Error ? e.message : String(e),
        );
      }
      await sleep(delayMs);
    }
    day.setUTCDate(day.getUTCDate() - 1);
  }

  const loaded = await loadOiHistory(db, symbol);
  const merged = mergeOiSnapshots(loaded.entries, found);
  await saveOiHistory(db, symbol, merged);

  return {
    symbol,
    added: found.length,
    tradingDaysFound: found.length,
    holidaysSkipped,
    scannedFrom: earliest ? dateKey(earliest) : scannedTo,
    scannedTo,
    earliestDate: earliest ? dateKey(earliest) : null,
    totalPoints: merged.length,
    sample: merged.slice(-5),
  };
}
