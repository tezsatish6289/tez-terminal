import assert from "node:assert/strict";
import { istDayStartEpochSec, type DailyOhlcCandle } from "../../src/lib/levels/daily-candle-live";
import {
  dailyBarKey,
  expectedLastClosedSessionKey,
  mergeDailyBars,
  planDailyFetch,
  sanitizeClosedBar,
  sliceDailyByDays,
  widenCoversFrom,
  type DailyStoreState,
} from "../../src/lib/levels/candle-store-core";

const DAY_MS = 24 * 60 * 60 * 1000;

function bar(dateKey: string, close: number, extra: Partial<DailyOhlcCandle> = {}): DailyOhlcCandle {
  return { time: istDayStartEpochSec(dateKey), open: close, high: close, low: close, close, ...extra };
}

// mergeDailyBars: dedupe by date (incoming wins), sort ascending.
{
  const existing = [bar("2026-07-01", 10), bar("2026-07-02", 20)];
  const incoming = [bar("2026-07-02", 25), bar("2026-07-03", 30)];
  const out = mergeDailyBars(existing, incoming, 400);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(dailyBarKey), ["2026-07-01", "2026-07-02", "2026-07-03"]);
  assert.equal(out[1]!.close, 25, "incoming value wins on duplicate date");
}

// mergeDailyBars: caps to the most recent N bars.
{
  const existing = Array.from({ length: 10 }, (_, i) => bar(`2026-07-${String(i + 1).padStart(2, "0")}`, i));
  const out = mergeDailyBars(existing, [], 5);
  assert.equal(out.length, 5);
  assert.equal(dailyBarKey(out[0]!), "2026-07-06");
  assert.equal(dailyBarKey(out[4]!), "2026-07-10");
}

// expectedLastClosedSessionKey: weekday after close → today.
{
  const monAfterClose = Date.UTC(2026, 6, 6, 11, 0); // Mon 16:30 IST
  assert.equal(expectedLastClosedSessionKey(monAfterClose), "2026-07-06");
}
// weekday before close → previous weekday.
{
  const monMidday = Date.UTC(2026, 6, 6, 6, 0); // Mon 11:30 IST
  assert.equal(expectedLastClosedSessionKey(monMidday), "2026-07-03");
}
// weekend → previous Friday.
{
  const sun = Date.UTC(2026, 6, 5, 6, 0); // Sun 11:30 IST
  assert.equal(expectedLastClosedSessionKey(sun), "2026-07-03");
}

// sliceDailyByDays: keeps only bars within the window.
{
  const now = Date.UTC(2026, 6, 6, 6, 0);
  const bars = [
    bar("2026-05-01", 1),
    bar("2026-07-01", 2),
    bar("2026-07-05", 3),
  ];
  const out = sliceDailyByDays(bars, 10, now); // ~since 2026-06-26
  assert.deepEqual(out.map(dailyBarKey), ["2026-07-01", "2026-07-05"]);
}

// planDailyFetch: cold store → full.
{
  const store: DailyStoreState = { bars: [], updatedThrough: null, checkedThroughMs: null, coversFrom: null };
  const plan = planDailyFetch(store, { days: 130, nowMs: Date.UTC(2026, 6, 6, 11, 0), backoffMs: 3600_000 });
  assert.equal(plan.mode, "full");
  assert.equal(plan.fetchDays, 130);
}

// planDailyFetch: coverage doesn't reach far enough back → full.
{
  const now = Date.UTC(2026, 6, 6, 11, 0);
  const store: DailyStoreState = {
    bars: [bar("2026-07-01", 1), bar("2026-07-06", 2)],
    updatedThrough: "2026-07-06",
    checkedThroughMs: now,
    coversFrom: "2026-07-01", // only ~5 days of coverage
  };
  const plan = planDailyFetch(store, { days: 130, nowMs: now, backoffMs: 3600_000 });
  assert.equal(plan.mode, "full");
}

// planDailyFetch: fully current → none.
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon after close
  const bars = [bar("2026-01-01", 1), bar("2026-07-03", 2), bar("2026-07-06", 3)];
  const store: DailyStoreState = {
    bars,
    updatedThrough: "2026-07-06",
    checkedThroughMs: now,
    coversFrom: "2026-01-01",
  };
  const plan = planDailyFetch(store, { days: 130, nowMs: now, backoffMs: 3600_000 });
  assert.equal(plan.mode, "none");
  assert.equal(plan.fetchDays, 0);
}

// planDailyFetch: leading weekend/holiday doesn't force a full refetch.
// Oldest bar is *newer* than the requested window start, but coverage reaches
// back far enough → should NOT be "full" (this is the hot PVT path).
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon after close, expected 2026-07-06
  const bars = [bar("2026-02-02", 1), bar("2026-07-06", 2)]; // oldest bar Feb 2 (Mon)
  const store: DailyStoreState = {
    bars,
    updatedThrough: "2026-07-06",
    checkedThroughMs: now,
    coversFrom: "2026-01-27", // we fetched from ~130d ago, before the leading weekend
  };
  const plan = planDailyFetch(store, { days: 130, nowMs: now, backoffMs: 3600_000 });
  assert.equal(plan.mode, "none", "coverage reaches back far enough → no full refetch");
}

// planDailyFetch: gap + past backoff → tail covering the gap.
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon after close, expected 2026-07-06
  const bars = [bar("2026-01-01", 1), bar("2026-06-30", 2)]; // ~6 days behind
  const store: DailyStoreState = {
    bars,
    updatedThrough: "2026-06-30",
    checkedThroughMs: now - 2 * 3600_000, // checked 2h ago (> backoff)
    coversFrom: "2026-01-01",
  };
  const plan = planDailyFetch(store, { days: 130, nowMs: now, backoffMs: 3600_000 });
  assert.equal(plan.mode, "tail");
  assert.ok(plan.fetchDays >= 8, `tail must cover the ~6-day gap, got ${plan.fetchDays}`);
  assert.ok(plan.fetchDays <= 130);
}

// planDailyFetch: gap but within backoff → none (holiday guard).
{
  const now = Date.UTC(2026, 6, 6, 11, 0);
  const bars = [bar("2026-01-01", 1), bar("2026-06-30", 2)];
  const store: DailyStoreState = {
    bars,
    updatedThrough: "2026-06-30",
    checkedThroughMs: now - 5 * 60_000, // checked 5 min ago (< backoff)
    coversFrom: "2026-01-01",
  };
  const plan = planDailyFetch(store, { days: 130, nowMs: now, backoffMs: 3600_000 });
  assert.equal(plan.mode, "none");
}

// widenCoversFrom: a full fetch pushes coverage back; a tail keeps it.
{
  const now = Date.UTC(2026, 6, 6, 11, 0);
  const full = widenCoversFrom(null, 130, now);
  assert.ok(full < "2026-07-06", "130-day fetch covers well before today");
  // A later 10-day tail must not shrink coverage.
  assert.equal(widenCoversFrom(full, 10, now), full);
  // A wider full fetch (365) pushes coverage further back.
  const wider = widenCoversFrom(full, 365, now);
  assert.ok(wider < full, "365-day fetch reaches further back than 130-day");
}

// sanitizeClosedBar: drops live flag, keeps finite volume, omits bad volume.
{
  const s = sanitizeClosedBar({ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 100, live: true });
  assert.equal("live" in s, false);
  assert.equal(s.volume, 100);
  const s2 = sanitizeClosedBar({ time: 1, open: 1, high: 2, low: 0, close: 1 });
  assert.equal("volume" in s2, false);
}

console.log("candle-store-core.test.ts passed");
