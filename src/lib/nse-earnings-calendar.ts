/**
 * NSE results (earnings) calendar — the free, authoritative source for upcoming
 * F&O results dates, used to tag levels with earnings gap-risk.
 *
 * Source: NSE "Board Meetings" filings. Companies are legally required to
 * intimate the exchange before a results meeting, so this is first-hand data.
 * Entries whose `purpose` mentions results are kept; everything else (dividends,
 * fund-raising, buybacks, …) is ignored for v1.
 *
 * Refreshed once a day (results dates move slowly) from `daily-housekeeping`,
 * reusing the shared `NseSession` cookie/rate-limit/circuit machinery. The pure
 * parse + window helpers below are dependency-free and unit-tested; the fetch /
 * persist helpers are best-effort and never throw into their callers.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { NseSession } from "@/lib/nse/client";
import { normalizeStockSymbol } from "@/lib/nse/fno-symbol";

const NSE_BOARD_MEETINGS =
  "https://www.nseindia.com/api/corporate-board-meetings?index=equities";

export const EARNINGS_CALENDAR_DOC = "config/earnings_calendar";

/** Loose shape of an NSE board-meeting row (field names vary across responses). */
export interface BoardMeetingRow {
  symbol?: string;
  bm_symbol?: string;
  purpose?: string;
  bm_purpose?: string;
  bm_desc?: string;
  meetingDate?: string;
  bm_date?: string;
  date?: string;
}

function firstString(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * True when board-meeting text indicates a *financial results* meeting.
 *
 * NSE's `bm_purpose` is usually the generic "Board Meeting Intimation"; the real
 * agenda lives in `bm_desc` ("…to consider the Audited Financial Results…").
 * We require a financial qualifier near "results" so unrelated hits like
 * "results of the postal ballot" / "voting results" don't false-positive.
 */
const RESULTS_RE =
  /\b(?:financial|audited|un-?audited|quarterly|half[-\s]?yearly|yearly|annual|standalone|consolidated)\b[\s\S]{0,40}?\bresults?\b/i;

export function purposeIsResults(purpose: string | null): boolean {
  if (!purpose) return false;
  return RESULTS_RE.test(purpose);
}

/**
 * Parse NSE board-meeting dates which come as `dd-MMM-yyyy` (e.g. `15-Jul-2026`)
 * into an ISO date string (midnight UTC). Returns null on anything unparseable.
 */
export function parseBoardMeetingDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // NSE's primary format `dd-MMM-yyyy` parses inconsistently across engines
  // (and in local time), so pin it to midnight UTC explicitly, before any
  // native fallback.
  const m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mon = months[m[2].toLowerCase()];
    if (mon === undefined) return null;
    const d = new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const native = Date.parse(s);
  return Number.isFinite(native) ? new Date(native).toISOString() : null;
}

/**
 * Reduce raw board-meeting rows to a `symbol → next results ISO date` map.
 * Keeps only results meetings; when a symbol has several, keeps the earliest
 * still-upcoming date (oldest meetings in the past are dropped).
 */
export function parseEarningsFromBoardMeetings(
  rows: BoardMeetingRow[],
  now: number = Date.now(),
): Record<string, string> {
  const out: Record<string, string> = {};
  const startOfToday = now - (now % 86_400_000);

  for (const row of rows) {
    // Combine every text field — the results agenda is usually only in bm_desc.
    const purposeText = [row.purpose, row.bm_purpose, row.bm_desc]
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .join(" ");
    if (!purposeIsResults(purposeText)) continue;

    const rawSym = firstString(row.symbol, row.bm_symbol);
    if (!rawSym) continue;
    const symbol = normalizeStockSymbol(rawSym);
    if (!symbol) continue;

    const iso = parseBoardMeetingDate(firstString(row.meetingDate, row.bm_date, row.date));
    if (!iso) continue;
    if (Date.parse(iso) < startOfToday) continue; // already happened

    const existing = out[symbol];
    if (!existing || Date.parse(iso) < Date.parse(existing)) out[symbol] = iso;
  }

  return out;
}

/** Fetch raw board meetings via the shared NSE session. Throws on NSE block. */
export async function fetchBoardMeetings(session: NseSession): Promise<BoardMeetingRow[]> {
  const json = await session.fetchJson<BoardMeetingRow[] | { data?: BoardMeetingRow[] }>(
    NSE_BOARD_MEETINGS,
  );
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  return [];
}

/** Persist the earnings map (symbol → ISO date) for downstream reads. */
export async function persistEarningsCalendar(
  db: Firestore,
  calendar: Record<string, string>,
): Promise<void> {
  await db.doc(EARNINGS_CALENDAR_DOC).set({
    entries: calendar,
    count: Object.keys(calendar).length,
    updatedAt: new Date().toISOString(),
  });
}

/** Load the persisted earnings map; returns an empty map on any failure. */
export async function loadEarningsCalendar(db: Firestore): Promise<Record<string, string>> {
  try {
    const snap = await db.doc(EARNINGS_CALENDAR_DOC).get();
    const entries = snap.data()?.entries;
    return entries && typeof entries === "object" ? (entries as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface EarningsRefreshResult {
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * Refresh the stored earnings calendar from NSE. Best-effort: returns an error
 * result instead of throwing so the daily housekeeping cron stays green.
 */
export async function refreshEarningsCalendar(
  db: Firestore,
  session: NseSession,
): Promise<EarningsRefreshResult> {
  try {
    const rows = await fetchBoardMeetings(session);
    const calendar = parseEarningsFromBoardMeetings(rows);
    await persistEarningsCalendar(db, calendar);
    return { ok: true, count: Object.keys(calendar).length };
  } catch (e) {
    return { ok: false, count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
