import assert from "node:assert/strict";
import { computePvt, pvtSlopeSignal, pvtSlopeSince, pvtValueAt } from "../../src/lib/levels/pvt";

// Starts at zero on the first bar.
{
  const pvt = computePvt([
    { time: 1, close: 100, volume: 1000 },
    { time: 2, close: 110, volume: 2000 },
  ]);
  assert.equal(pvt.length, 2);
  assert.equal(pvt[0]!.value, 0);
  assert.equal(pvt[1]!.value, 200); // 2000 × (110-100)/100
}

// Flat price → PVT stays at zero.
{
  const pvt = computePvt([
    { time: 1, close: 50, volume: 500 },
    { time: 2, close: 50, volume: 800 },
    { time: 3, close: 50, volume: 1200 },
  ]);
  assert.deepEqual(pvt.map((p) => p.value), [0, 0, 0]);
}

// Down move subtracts volume-weighted change.
{
  const pvt = computePvt([
    { time: 1, close: 200, volume: 1000 },
    { time: 2, close: 180, volume: 1000 },
  ]);
  assert.equal(pvt[1]!.value, -100); // 1000 × (180-200)/200
}

// ── pvtSlopeSignal ─────────────────────────────────────────────────────────
// Monotonic accumulation → efficiency ratio +1.
{
  const pts = Array.from({ length: 25 }, (_, i) => ({ time: i, value: i * 10 }));
  assert.equal(pvtSlopeSignal(pts, 20), 1);
}

// Monotonic distribution → −1.
{
  const pts = Array.from({ length: 25 }, (_, i) => ({ time: i, value: -i * 10 }));
  assert.equal(pvtSlopeSignal(pts, 20), -1);
}

// Choppy series (real movement, no net drift) → 0.
{
  const pts = [0, 5, 0, 5, 0, 5, 0].map((v, i) => ({ time: i, value: v }));
  assert.equal(pvtSlopeSignal(pts, 6), 0);
}

// Perfectly flat series (e.g. zero-volume index candles) → null, not 0,
// so it is excluded from the direction blend rather than dampening it.
{
  const flat = Array.from({ length: 25 }, (_, i) => ({ time: i, value: 0 }));
  assert.equal(pvtSlopeSignal(flat, 20), null);
}

// Partial-trend efficiency is between 0 and 1 (net < total absolute movement).
{
  // up 100, down 40, up 60 → net 120, totalAbs 200 → 0.6
  const pts = [
    { time: 0, value: 0 },
    { time: 1, value: 100 },
    { time: 2, value: 60 },
    { time: 3, value: 120 },
  ];
  assert.equal(pvtSlopeSignal(pts, 20), 0.6);
}

// Too little history → null.
{
  assert.equal(pvtSlopeSignal([{ time: 0, value: 0 }], 20), null);
}

// ── pvtSlopeSince (event-anchored) ─────────────────────────────────────────
// Only the moves since the anchor bar count. Pre-dip trend is ignored: a series
// that fell hard before the dip then rose steadily after reads clean +1.
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: -500 }, // pre-dip crash (ignored)
    { time: 300, value: -500 }, // ← dip bar (anchor)
    { time: 400, value: -400 },
    { time: 500, value: -300 },
    { time: 600, value: -200 },
  ];
  // Anchor at the dip's exact time → measured from that bar to now: steady rise.
  assert.equal(pvtSlopeSince(pts, 300), 1);
}

// Falling since the dip → −1 (breakdown / rejection confirmation).
{
  const pts = [
    { time: 300, value: 0 }, // dip bar
    { time: 400, value: -100 },
    { time: 500, value: -200 },
    { time: 600, value: -300 },
  ];
  assert.equal(pvtSlopeSince(pts, 300), -1);
}

// Anchor falls between bars → we snap to the bar at/just before it (dip day).
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 50 }, // ← at/just before anchor 250
    { time: 300, value: 150 },
    { time: 400, value: 250 },
  ];
  // From value 50 → 250, monotonic → +1 (bar at 100 excluded).
  assert.equal(pvtSlopeSince(pts, 250), 1);
}

// Same-day dip: only the dip bar exists so far → null (confirmation accrues).
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 100 }, // dip bar == latest bar
  ];
  assert.equal(pvtSlopeSince(pts, 200), null);
}

// Flat since the dip (real bars, no net PVT drift) → null, no usable signal.
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 0 },
    { time: 300, value: 0 },
  ];
  assert.equal(pvtSlopeSince(pts, 100), null);
}

// Dip predates all history → fall back to the first bar.
{
  const pts = [
    { time: 500, value: 0 },
    { time: 600, value: 40 },
    { time: 700, value: 100 },
  ];
  assert.equal(pvtSlopeSince(pts, 1), 1);
}

// Non-finite anchor or empty series → null.
{
  assert.equal(pvtSlopeSince([], 100), null);
  assert.equal(pvtSlopeSince([{ time: 1, value: 0 }, { time: 2, value: 5 }], Number.NaN), null);
}

// maxSessions caps the window to N bars after the dip (calibration freeze): the
// post-window move is ignored, so an early rise then reversal still reads clean.
{
  const pts = [
    { time: 100, value: 0 }, // dip bar (anchor)
    { time: 200, value: 50 },
    { time: 300, value: 100 }, // ← end of a 2-session window
    { time: 400, value: -200 }, // later reversal — excluded by the cap
    { time: 500, value: -400 },
  ];
  assert.equal(pvtSlopeSince(pts, 100, { maxSessions: 2 }), 1);
  // Unbounded (to-date) sees the reversal and flips negative.
  const toDate = pvtSlopeSince(pts, 100);
  assert.ok(toDate !== null && toDate < 0, `to-date should be bearish: ${toDate}`);
}

// maxSessions but not enough bars yet → null (confirmation still accruing).
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 30 },
  ];
  assert.equal(pvtSlopeSince(pts, 200, { maxSessions: 5 }), null); // only the dip bar at/after anchor
}

// untilTimeSec caps the window at exit (entry→exit): post-exit bars are ignored,
// so a winning trade's confirmation isn't diluted by what happened afterwards.
{
  const pts = [
    { time: 100, value: 0 }, // entry (anchor)
    { time: 200, value: 50 },
    { time: 300, value: 100 }, // ← exit at t=300
    { time: 400, value: -300 }, // post-exit collapse — excluded
  ];
  assert.equal(pvtSlopeSince(pts, 100, { untilTimeSec: 300 }), 1);
  // Without the cap, the post-exit collapse flips it negative.
  const uncapped = pvtSlopeSince(pts, 100);
  assert.ok(uncapped !== null && uncapped < 0, `uncapped should be bearish: ${uncapped}`);
}

// untilTimeSec between bars snaps the end to the bar at/before it.
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 40 },
    { time: 300, value: 80 },
    { time: 400, value: 500 },
  ];
  // exit at 350 → end bar is t=300 (value 80): entry→exit monotonic → +1.
  assert.equal(pvtSlopeSince(pts, 100, { untilTimeSec: 350 }), 1);
}

// ── pvtValueAt (real chart level) ──────────────────────────────────────────
{
  const pts = [
    { time: 100, value: 0 },
    { time: 200, value: 1200 },
    { time: 300, value: 900 },
  ];
  assert.equal(pvtValueAt(pts, 200), 1200); // exact bar
  assert.equal(pvtValueAt(pts, 250), 1200); // snaps to bar at/just before
  assert.equal(pvtValueAt(pts, 300), 900);
  assert.equal(pvtValueAt(pts, 999), 900); // "now" → last bar
  assert.equal(pvtValueAt(pts, 50), null); // predates all bars
  assert.equal(pvtValueAt([], 100), null);
  assert.equal(pvtValueAt(pts, Number.NaN), null);
}
