import assert from "node:assert/strict";
import {
  matchesDirectionalSetup,
  matchesNearBearSetup,
  matchesNearBullSetup,
  matchesSlideshowSetup,
  pocRiskRewardRatio,
  type ZoneBands,
} from "../../src/lib/zones/zone-status";
import type { OiWallMomentum } from "../../src/lib/zones/oi-momentum-signal";

function bands(input: ZoneBands & { halfWidth: number }) {
  const { halfWidth, ...b } = input;
  return { bands: b, halfWidth };
}

// Confirming OI signals (wall building + that side dominant) — the live screen
// gate. Setups now require this; RR is no longer a gate.
const oiBull: OiWallMomentum = {
  asOf: "2026-06-25",
  prevDate: "2026-06-24",
  putDeltaPct: 5,
  callDeltaPct: -1,
  dominancePct: 10,
  dominantSide: "put",
};
const oiBear: OiWallMomentum = {
  asOf: "2026-06-25",
  prevDate: "2026-06-24",
  putDeltaPct: -1,
  callDeltaPct: 5,
  dominancePct: 10,
  dominantSide: "call",
};

// pocRiskRewardRatio still computes (used for display) even though RR no longer gates.
{
  const { bands: b, halfWidth } = bands({
    spot: 14.99,
    bullLow: 12,
    bullHigh: 14,
    bearLow: 15,
    bearHigh: 17,
    halfWidth: 1,
  });
  const rr = pocRiskRewardRatio(b, 13, halfWidth, "bear");
  assert.ok(rr != null && rr < 2);
  // spot is NEAR (not IN) the bear band → directional setup is false on geometry.
  assert.equal(matchesDirectionalSetup(b, 13, "bear", halfWidth, oiBear), false);
}

// Bull — spot inside bull band, POC above, OI confirming. Passes WITHOUT any RR gate.
{
  const { bands: b, halfWidth } = bands({
    spot: 108,
    bullLow: 90,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 150,
    halfWidth: 5,
  });
  const rr = pocRiskRewardRatio(b, 130, halfWidth, "bull");
  assert.ok(rr != null && rr >= 2);
  assert.equal(matchesDirectionalSetup(b, 130, "bull", halfWidth, oiBull), true);
}

// Low-RR bull still qualifies now that RR is not a gate (POC above spot but
// only ~0.5:1 to POC from the band center).
{
  const { bands: b, halfWidth } = bands({
    spot: 101,
    bullLow: 90,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 150,
    halfWidth: 5,
  });
  const rr = pocRiskRewardRatio(b, 108, halfWidth, "bull");
  assert.ok(rr != null && rr < 2);
  assert.equal(matchesDirectionalSetup(b, 108, "bull", halfWidth, oiBull), true);
}

// OI gate: same bull geometry but the put wall NOT building / not dominant → fails.
{
  const { bands: b, halfWidth } = bands({
    spot: 108,
    bullLow: 90,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 150,
    halfWidth: 5,
  });
  const notBuilding: OiWallMomentum = { ...oiBull, putDeltaPct: -3 };
  const wrongSide: OiWallMomentum = { ...oiBull, dominantSide: "call" };
  assert.equal(matchesDirectionalSetup(b, 130, "bull", halfWidth, notBuilding), false);
  assert.equal(matchesDirectionalSetup(b, 130, "bull", halfWidth, wrongSide), false);
  // Strict fail-closed: no signal → no qualify.
  assert.equal(matchesDirectionalSetup(b, 130, "bull", halfWidth, null), false);
}

// Near support — geographic near + POC above + confirming OI.
{
  const { bands: b, halfWidth } = bands({
    spot: 99.6,
    bullLow: 100,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 150,
    halfWidth: 5,
  });
  assert.equal(matchesNearBullSetup(b, 130, halfWidth, oiBull), true);
  assert.equal(matchesSlideshowSetup(b, 130, "near_bull", halfWidth, oiBull), true);
  // POC on wrong side fails regardless of OI.
  assert.equal(matchesNearBullSetup(b, 95, halfWidth, oiBull), false);
}

// Near resistance — POC must be below spot; confirming call OI required.
{
  const { bands: b, halfWidth } = bands({
    spot: 129.6,
    bullLow: 90,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 140,
    halfWidth: 5,
  });
  assert.equal(matchesNearBearSetup(b, 135, halfWidth, oiBear), false);
  assert.equal(matchesNearBearSetup(b, 110, halfWidth, oiBear), true);
}

console.log("zone-status-poc-rr.test.ts ok");
