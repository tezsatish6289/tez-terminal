import assert from "node:assert/strict";
import {
  entryMeetsMinPocRR,
  entryPocRiskRewardRatio,
  MIN_POC_RISK_REWARD,
} from "../../src/lib/zones/zone-status";
import {
  clusterOiImbalanceRatio,
  clustersTooBalanced,
  MIN_CLUSTER_OI_IMBALANCE,
} from "../../src/lib/options-zones";
import { evaluateZoneBot } from "../../src/lib/zone-bot-engine";
import type { ZoneBotSettings } from "../../src/lib/zone-bot-config";
import type { ZoneBotState } from "../../src/lib/zone-bot-state";

// Entry RR — bad shape at top of bull band
{
  const rr = entryPocRiskRewardRatio("BUY", 104, 90, 110);
  assert.ok(rr != null && rr < MIN_POC_RISK_REWARD);
  assert.equal(entryMeetsMinPocRR("BUY", 104, 90, 110), false);
}

// Entry RR — major level at band center
{
  const rr = entryPocRiskRewardRatio("BUY", 100, 90, 120);
  assert.ok(rr != null && rr >= MIN_POC_RISK_REWARD);
  assert.equal(entryMeetsMinPocRR("BUY", 100, 90, 120), true);
}

// Cluster imbalance — equal OI is balanced
{
  assert.equal(clusterOiImbalanceRatio(5000, 5000), 0);
  assert.equal(clustersTooBalanced(5000, 5000), true);
}

// Cluster imbalance — 2:1 split passes
{
  const ratio = clusterOiImbalanceRatio(6000, 3000);
  assert.ok(ratio != null && ratio >= MIN_CLUSTER_OI_IMBALANCE);
  assert.equal(clustersTooBalanced(6000, 3000), false);
}

// Engine skips OPEN when entry POC RR fails
{
  const settings: ZoneBotSettings = {
    manualOverride: "AUTO",
    zoneHalfWidthUsd: 500,
    zoneConfirmMinutes: 15,
  };
  const state: ZoneBotState = {
    direction: "IDLE",
    confirming: null,
    openTradeId: null,
    openLiveTradeIds: {},
    lastFlipAt: null,
    reason: "",
    priceHistory: [],
    updatedAt: new Date().toISOString(),
  };
  const now = Date.now();
  const history = Array.from({ length: 20 }, (_, i) => ({
    price: 100,
    ts: now - (19 - i) * 60_000,
  }));

  const { action, nextState } = evaluateZoneBot({
    asset: "btc",
    spot: 100,
    suggested: {
      bullZoneLow: 98,
      bullZoneHigh: 102,
      bullExitAbove: 102,
      bearZoneHigh: 120,
      bearZoneLow: 115,
      bearExitBelow: 115,
      maxPain: 106,
      computedAt: new Date(now).toISOString(),
      bullActionable: true,
      halfWidthUsd: 2,
    },
    settings,
    state,
    history,
    now,
  });

  assert.equal(action.type, "NONE");
  assert.match(nextState.reason, /POC RR/i);
}

console.log("zone-bot-entry-rr.test.ts ok");
