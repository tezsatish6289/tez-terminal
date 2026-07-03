import assert from "node:assert/strict";
import { computePvt } from "../../src/lib/levels/pvt";

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
