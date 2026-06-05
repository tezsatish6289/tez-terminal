import assert from "node:assert/strict";
import {
  matchesDirectionalSetup,
  matchesNearBearSetup,
  matchesNearBullSetup,
  matchesSlideshowSetup,
  pocRiskRewardRatio,
  type ZoneBands,
} from "../../src/lib/zones/zone-status";

function bands(input: ZoneBands & { halfWidth: number }) {
  const { halfWidth, ...b } = input;
  return { bands: b, halfWidth };
}

// IDEA — bear zone, POC too close vs Bear Inv (~1:2, not 1:3)
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
  assert.equal(matchesDirectionalSetup(b, 13, "bear", halfWidth), false);
}

// Synthetic bull — 2:1 from zone center (100) to POC vs Bull Inv
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
  assert.equal(matchesDirectionalSetup(b, 130, "bull", halfWidth), true);
}

// Near support — geographic near + POC above + 2:1 from band center
{
  const { bands: b, halfWidth } = bands({
    spot: 99.6,
    bullLow: 100,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 150,
    halfWidth: 5,
  });
  assert.equal(matchesNearBullSetup(b, 130, halfWidth), true);
  assert.equal(matchesSlideshowSetup(b, 130, "near_bull", halfWidth), true);
  assert.equal(matchesNearBullSetup(b, 95, halfWidth), false);
}

// Near resistance — POC on wrong side fails
{
  const { bands: b, halfWidth } = bands({
    spot: 129.6,
    bullLow: 90,
    bullHigh: 110,
    bearLow: 130,
    bearHigh: 140,
    halfWidth: 5,
  });
  assert.equal(matchesNearBearSetup(b, 135, halfWidth), false);
  assert.equal(matchesNearBearSetup(b, 110, halfWidth), true);
}

console.log("zone-status-poc-rr.test.ts ok");
