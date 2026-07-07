/**
 * Pure helpers for OI history gap-fill / freshness (no server deps — testable).
 */

const IST_OFFSET_MS = 5.5 * 3600_000;
/** Bhavcopy is reliably published well before this IST minute-of-day. */
const PUBLISH_CUTOFF_MIN = 18 * 60; // 6:00 PM IST

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

/** True when stored OI points already include the latest completed session. */
export function isOiHistorySeriesFresh(
  lastDate: string | null | undefined,
  expected: string,
): boolean {
  return lastDate != null && lastDate >= expected;
}

/** Weekday keys in (lastDate, expected], oldest→newest, capped. */
export function incrementalOiHistoryDates(
  lastDate: string,
  expected: string,
  cap: number,
): string[] {
  const out: string[] = [];
  let cursor = addDaysKey(lastDate, 1);
  while (cursor <= expected && out.length < cap) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return out;
}

/** The `cap` most recent weekday keys ending at `expected`, oldest→newest. Pure. */
export function coldProbeDates(expected: string, cap: number): string[] {
  const out: string[] = [];
  let cursor = expected;
  while (out.length < cap) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor = addDaysKey(cursor, -1);
  }
  return out.reverse();
}
