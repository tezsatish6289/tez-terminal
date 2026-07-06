import assert from "node:assert/strict";
import {
  BAR_MIN,
  LAST_BAR_OPEN_MIN,
  SESSION_CLOSE_MIN,
  SESSION_OPEN_MIN,
  intradayBarBoundary,
  istEpochSec,
  missingClosedBars,
  prevWeekdayKey,
} from "../../src/lib/levels/intraday-session";

// Helper: minute-of-day (IST) for a bucket start epoch on a given day key.
function minuteOfDay(epochSec: number, dateKey: string): number {
  return (epochSec - istEpochSec(dateKey, 0)) / 60;
}

// Monday 2026-07-06 is a weekday; Friday 2026-07-03; Saturday 2026-07-04.
const MON = "2026-07-06";
const FRI = "2026-07-03";

// prevWeekdayKey skips weekends.
{
  assert.equal(prevWeekdayKey(MON), FRI, "Monday's previous weekday is Friday");
  assert.equal(prevWeekdayKey("2026-07-07"), MON, "Tuesday's previous weekday is Monday");
}

// Pre-open (09:00 IST Monday) → not in session, last close = Friday 15:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 3, 30)); // 09:00 IST
  assert.equal(b.inSession, false);
  assert.equal(b.curBucketStartSec, null);
  assert.equal(b.lastClosedBucketSec, istEpochSec(FRI, LAST_BAR_OPEN_MIN));
}

// First bar (09:20 IST) → forming bar starts 09:15, last close = Friday 15:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 3, 50)); // 09:20 IST
  assert.equal(b.inSession, true);
  assert.equal(minuteOfDay(b.curBucketStartSec!, MON), SESSION_OPEN_MIN);
  assert.equal(b.lastClosedBucketSec, istEpochSec(FRI, LAST_BAR_OPEN_MIN));
}

// Exactly at open (09:15 IST) → forming bar is the first bar.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 3, 45)); // 09:15 IST
  assert.equal(b.inSession, true);
  assert.equal(minuteOfDay(b.curBucketStartSec!, MON), SESSION_OPEN_MIN);
  assert.equal(b.lastClosedBucketSec, istEpochSec(FRI, LAST_BAR_OPEN_MIN));
}

// Mid-session (12:07 IST) → forming bar 12:00, last close 11:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 6, 37)); // 12:07 IST
  assert.equal(b.inSession, true);
  assert.equal(minuteOfDay(b.curBucketStartSec!, MON), 12 * 60);
  assert.equal(minuteOfDay(b.lastClosedBucketSec, MON), 12 * 60 - BAR_MIN);
}

// One second before close (15:59:59 IST) → forming bar 15:45, last close 15:30.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 10, 29, 59)); // 15:59:59 IST
  assert.equal(b.inSession, true);
  assert.equal(minuteOfDay(b.curBucketStartSec!, MON), LAST_BAR_OPEN_MIN);
  assert.equal(minuteOfDay(b.lastClosedBucketSec, MON), LAST_BAR_OPEN_MIN - BAR_MIN);
}

// Exactly at close (16:00 IST) → session over, last close = today 15:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 10, 30)); // 16:00 IST
  assert.equal(b.inSession, false);
  assert.equal(b.curBucketStartSec, null);
  assert.equal(b.lastClosedBucketSec, istEpochSec(MON, LAST_BAR_OPEN_MIN));
  assert.equal(SESSION_CLOSE_MIN, 960);
}

// After close (16:30 IST) → last close = today 15:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 11, 0)); // 16:30 IST
  assert.equal(b.inSession, false);
  assert.equal(b.lastClosedBucketSec, istEpochSec(MON, LAST_BAR_OPEN_MIN));
}

// Weekend (Saturday 12:00 IST) → not in session, last close = Friday 15:45.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 4, 6, 30)); // Sat 12:00 IST
  assert.equal(b.inSession, false);
  assert.equal(b.curBucketStartSec, null);
  assert.equal(b.lastClosedBucketSec, istEpochSec(FRI, LAST_BAR_OPEN_MIN));
}

// missingClosedBars: null → missing; stale → missing; up-to-date → not missing.
{
  const b = intradayBarBoundary(Date.UTC(2026, 6, 6, 11, 0)); // after close Mon
  assert.equal(missingClosedBars(null, b), true);
  assert.equal(missingClosedBars(b.lastClosedBucketSec - BAR_MIN * 60, b), true);
  assert.equal(missingClosedBars(b.lastClosedBucketSec, b), false);
  assert.equal(missingClosedBars(b.lastClosedBucketSec + BAR_MIN * 60, b), false);
}

console.log("intraday-session.test.ts passed");
