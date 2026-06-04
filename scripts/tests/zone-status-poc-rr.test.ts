import assert from "node:assert/strict";
import {
  matchesDirectionalSetup,
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

// Synthetic bull — 2:1 from spot to POC vs Bull Inv
{
  const { bands: b, halfWidth } = bands({
    spot: 100,
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

console.log("zone-status-poc-rr.test.ts ok");
