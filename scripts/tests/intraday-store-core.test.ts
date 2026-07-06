import assert from "node:assert/strict";
import { intradayBarBoundary, istEpochSec } from "../../src/lib/levels/intraday-session";
import {
  mergeIntradayBars,
  planIntradayFetch,
  sliceIntradayByDays,
  splitClosedForming,
  widenCoversFromSec,
  type IntradayBar,
  type IntradayStoreState,
} from "../../src/lib/levels/intraday-store-core";

const DAY_SEC = 86_400;

function b(time: number, close = 100): IntradayBar {
  return { time, open: close, high: close, low: close, close, volume: 1000 };
}

const MON = "2026-07-06";
const FRI = "2026-07-03";

// mergeIntradayBars: dedupe by time (incoming wins), sort, cap.
{
  const existing = [b(100, 1), b(200, 2)];
  const incoming = [b(200, 9), b(300, 3)];
  const out = mergeIntradayBars(existing, incoming, 10);
  assert.deepEqual(out.map((x) => x.time), [100, 200, 300]);
  assert.equal(out[1]!.close, 9, "incoming wins on duplicate time");

  const many = Array.from({ length: 10 }, (_, i) => b(i));
  assert.equal(mergeIntradayBars(many, [], 5).length, 5);
  assert.equal(mergeIntradayBars(many, [], 5)[0]!.time, 5);
}

// splitClosedForming: in-session → forming = bar after last-closed bucket.
{
  const now = Date.UTC(2026, 6, 6, 6, 37); // Mon 12:07 IST → forming 12:00, last close 11:45
  const boundary = intradayBarBoundary(now);
  const fetched = [
    b(istEpochSec(MON, 11 * 60 + 30)), // 11:30 closed
    b(istEpochSec(MON, 11 * 60 + 45)), // 11:45 closed (== lastClosed)
    b(istEpochSec(MON, 12 * 60)), // 12:00 forming
  ];
  const { closed, forming } = splitClosedForming(fetched, boundary);
  assert.equal(closed.length, 2);
  assert.equal(closed[closed.length - 1]!.time, boundary.lastClosedBucketSec);
  assert.ok(forming);
  assert.equal(forming!.time, istEpochSec(MON, 12 * 60));
}

// splitClosedForming: out-of-session → everything closed, no forming.
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon 16:30 IST (after close)
  const boundary = intradayBarBoundary(now);
  const fetched = [
    b(istEpochSec(MON, 15 * 60 + 30)),
    b(istEpochSec(MON, 15 * 60 + 45)), // 15:45 → closed after 16:00
  ];
  const { closed, forming } = splitClosedForming(fetched, boundary);
  assert.equal(closed.length, 2);
  assert.equal(forming, null);
}

// widenCoversFromSec: full pushes back; tail keeps.
{
  const now = Date.UTC(2026, 6, 6, 11, 0);
  const full = widenCoversFromSec(null, 30, now);
  assert.equal(full, Math.floor(now / 1000) - 30 * DAY_SEC);
  assert.equal(widenCoversFromSec(full, 2, now), full, "tail must not shrink coverage");
}

// sliceIntradayByDays: keep only recent window.
{
  const now = Date.UTC(2026, 6, 6, 11, 0);
  const nowSec = Math.floor(now / 1000);
  const bars = [b(nowSec - 40 * DAY_SEC), b(nowSec - 5 * DAY_SEC), b(nowSec - 3600)];
  const out = sliceIntradayByDays(bars, 30, now);
  assert.equal(out.length, 2);
}

// planIntradayFetch: cold store → full.
{
  const store: IntradayStoreState = { bars: [], lastClosedSec: null, coversFromSec: null, checkedThroughMs: null };
  const now = Date.UTC(2026, 6, 6, 6, 0);
  const plan = planIntradayFetch(store, intradayBarBoundary(now), { nowMs: now, lookbackDays: 30 });
  assert.equal(plan.mode, "full");
  assert.equal(plan.fetchDays, 30);
}

// planIntradayFetch: coverage too shallow → full.
{
  const now = Date.UTC(2026, 6, 6, 6, 0);
  const nowSec = Math.floor(now / 1000);
  const store: IntradayStoreState = {
    bars: [b(nowSec - 3 * DAY_SEC)],
    lastClosedSec: nowSec - 3 * DAY_SEC,
    coversFromSec: nowSec - 3 * DAY_SEC, // only 3 days back
    checkedThroughMs: now,
  };
  const plan = planIntradayFetch(store, intradayBarBoundary(now), { nowMs: now, lookbackDays: 30 });
  assert.equal(plan.mode, "full");
}

// planIntradayFetch: market closed + caught up → none (zero Dhan calls).
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon after close
  const boundary = intradayBarBoundary(now);
  const nowSec = Math.floor(now / 1000);
  const store: IntradayStoreState = {
    bars: [b(nowSec - 30 * DAY_SEC), b(boundary.lastClosedBucketSec)],
    lastClosedSec: boundary.lastClosedBucketSec,
    coversFromSec: nowSec - 30 * DAY_SEC,
    checkedThroughMs: now,
  };
  const plan = planIntradayFetch(store, boundary, { nowMs: now, lookbackDays: 30 });
  assert.equal(plan.mode, "none");
  assert.equal(plan.fetchDays, 0);
}

// planIntradayFetch: in-session → always tail (need forming bar).
{
  const now = Date.UTC(2026, 6, 6, 6, 37); // Mon 12:07 IST
  const boundary = intradayBarBoundary(now);
  const nowSec = Math.floor(now / 1000);
  const store: IntradayStoreState = {
    bars: [b(nowSec - 30 * DAY_SEC), b(boundary.lastClosedBucketSec)],
    lastClosedSec: boundary.lastClosedBucketSec, // caught up on closed bars
    coversFromSec: nowSec - 30 * DAY_SEC,
    checkedThroughMs: now,
  };
  const plan = planIntradayFetch(store, boundary, { nowMs: now, lookbackDays: 30 });
  assert.equal(plan.mode, "tail");
  assert.ok(plan.fetchDays >= 2 && plan.fetchDays <= 30);
}

// planIntradayFetch: closed but behind → tail covering the gap.
{
  const now = Date.UTC(2026, 6, 6, 11, 0); // Mon after close, lastClosed = today 15:45
  const boundary = intradayBarBoundary(now);
  const nowSec = Math.floor(now / 1000);
  const store: IntradayStoreState = {
    bars: [b(nowSec - 30 * DAY_SEC), b(istEpochSec(FRI, 15 * 60 + 45))], // stuck at Friday
    lastClosedSec: istEpochSec(FRI, 15 * 60 + 45),
    coversFromSec: nowSec - 30 * DAY_SEC,
    checkedThroughMs: now,
  };
  const plan = planIntradayFetch(store, boundary, { nowMs: now, lookbackDays: 30 });
  assert.equal(plan.mode, "tail");
  assert.ok(plan.fetchDays >= 3, `tail should cover the weekend gap, got ${plan.fetchDays}`);
}

console.log("intraday-store-core.test.ts passed");
