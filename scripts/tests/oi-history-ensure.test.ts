import assert from "node:assert/strict";
import {
  coldProbeDates,
  incrementalOiHistoryDates,
  isOiHistorySeriesFresh,
  lastCompletedTradingSession,
} from "../../src/lib/oi-history-ensure-core";

// Tuesday 2026-07-07 09:00 IST — before 6 PM publish cutoff → last session is Monday Jul 6.
const TUE_MORNING_IST = Date.UTC(2026, 6, 7, 3, 30);

assert.equal(lastCompletedTradingSession(TUE_MORNING_IST), "2026-07-06");

// Freshness is driven only by lastDate vs expected (not checkedThrough alone).
assert.equal(isOiHistorySeriesFresh("2026-07-06", "2026-07-06"), true);
assert.equal(isOiHistorySeriesFresh("2026-07-02", "2026-07-06"), false);
assert.equal(isOiHistorySeriesFresh(null, "2026-07-06"), false);

// Regression: a poisoned doc with checkedThrough ahead of lastDate must NOT read as fresh.
{
  const lastDate = "2026-07-02";
  const expected = "2026-07-06";
  assert.equal(isOiHistorySeriesFresh(lastDate, expected), false);
}

// coldProbeDates skips weekends when walking back from expected.
{
  const dates = coldProbeDates("2026-07-06", 3);
  assert.deepEqual(dates, ["2026-07-02", "2026-07-03", "2026-07-06"]);
}

// Gap fill from Jul 2 → Jul 6 skips the weekend.
assert.deepEqual(
  incrementalOiHistoryDates("2026-07-02", "2026-07-06", 7),
  ["2026-07-03", "2026-07-06"],
);

console.log("oi-history-ensure.test.ts: ok");
