import assert from "node:assert/strict";
import { evalConfirmedSignal } from "../../src/lib/levels/confirmed-signal-core";

// Bullish: put dip + PVT up + spot back above put wall + below call wall.
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: 1_000,
    currentPvt: 1_500,
    originalCluster: 100, // dipped put wall
    spot: 105, // reclaimed above the put wall
    currentPutStrike: 98,
    currentCallStrike: 120, // still room up
  });
  assert.equal(sig, "bullish");
}

// Bearish: call dip + PVT down + spot back below call wall + above put wall.
{
  const sig = evalConfirmedSignal({
    side: "resistance",
    entryPvt: 2_000,
    currentPvt: 1_200,
    originalCluster: 200, // dipped call wall
    spot: 195, // rejected below the call wall
    currentPutStrike: 180, // still room down
    currentCallStrike: 205,
  });
  assert.equal(sig, "bearish");
}

// Bullish fails when PVT did not rise.
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: 1_500,
    currentPvt: 1_500, // flat, not rising
    originalCluster: 100,
    spot: 105,
    currentPutStrike: 98,
    currentCallStrike: 120,
  });
  assert.equal(sig, null);
}

// Bullish fails when spot has not reclaimed the put wall.
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: 1_000,
    currentPvt: 1_500,
    originalCluster: 100,
    spot: 99, // still below the put wall
    currentPutStrike: 98,
    currentCallStrike: 120,
  });
  assert.equal(sig, null);
}

// Bullish fails when spot has already reached the call wall (no room left).
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: 1_000,
    currentPvt: 1_500,
    originalCluster: 100,
    spot: 121, // past the call wall
    currentPutStrike: 98,
    currentCallStrike: 120,
  });
  assert.equal(sig, null);
}

// Bullish fails when the current call wall is unknown (can't confirm room).
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: 1_000,
    currentPvt: 1_500,
    originalCluster: 100,
    spot: 105,
    currentPutStrike: 98,
    currentCallStrike: null,
  });
  assert.equal(sig, null);
}

// Bearish fails when spot fell through the put wall (no room left).
{
  const sig = evalConfirmedSignal({
    side: "resistance",
    entryPvt: 2_000,
    currentPvt: 1_200,
    originalCluster: 200,
    spot: 179, // below the put wall
    currentPutStrike: 180,
    currentCallStrike: 205,
  });
  assert.equal(sig, null);
}

// Missing PVT reads abstain.
{
  const sig = evalConfirmedSignal({
    side: "support",
    entryPvt: null,
    currentPvt: 1_500,
    originalCluster: 100,
    spot: 105,
    currentPutStrike: 98,
    currentCallStrike: 120,
  });
  assert.equal(sig, null);
}

console.log("confirmed-signal.test.ts passed");
