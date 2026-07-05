import assert from "node:assert/strict";
import { computePvt, pvtSlopeSignal } from "../../src/lib/levels/pvt";

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

// Choppy series with no net drift → 0.
{
  const pts = [0, 5, 0, 5, 0, 5, 0].map((v, i) => ({ time: i, value: v }));
  assert.equal(pvtSlopeSignal(pts, 6), 0);
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
