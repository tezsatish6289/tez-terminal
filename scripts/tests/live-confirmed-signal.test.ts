import assert from "node:assert/strict";
import { liveConfirmedSignalFromCandles, liveCurrentPvtFromCandles } from "../../src/lib/levels/live-confirmed-signal";

const candles = [
  { time: 1, close: 100, volume: 1_000 },
  { time: 2, close: 102, volume: 1_200 },
  { time: 3, close: 101, volume: 900 },
  { time: 4, close: 105, volume: 1_500 },
];

{
  const entryPvt = 0;
  const currentPvt = liveCurrentPvtFromCandles(candles);
  assert.ok(currentPvt != null && currentPvt > entryPvt);
  const sig = liveConfirmedSignalFromCandles(
    { side: "support", entryPvt, originalCluster: 99 },
    candles,
    { spot: 104, putClusterStrike: 98, callClusterStrike: 110 },
  );
  assert.equal(sig, "bullish");
}

{
  const entryPvt = liveCurrentPvtFromCandles(candles)!;
  const bearishDay = [...candles.slice(0, 3), { time: 4, close: 95, volume: 2_000 }];
  const sig = liveConfirmedSignalFromCandles(
    { side: "support", entryPvt, originalCluster: 99 },
    bearishDay,
    { spot: 104, putClusterStrike: 98, callClusterStrike: 110 },
  );
  assert.equal(sig, null);
}

console.log("live-confirmed-signal.test.ts passed");
