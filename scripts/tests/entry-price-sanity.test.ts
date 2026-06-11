import assert from "node:assert/strict";
import {
  clampTradeRealizedPnlForReconcile,
  effectiveCapitalForSizing,
  killSwitchExitPrice,
  validateEntryVsMarket,
} from "../../src/lib/entry-price-sanity";

function testValidateEntryVsMarket() {
  assert.equal(validateEntryVsMarket(1.12, 1.1), null);
  assert.equal(validateEntryVsMarket(1.12, 63000)?.includes("away from market"), true);
  assert.equal(validateEntryVsMarket(1.12, null), null);
}

function testEffectiveCapitalForSizing() {
  assert.equal(
    effectiveCapitalForSizing({ capital: 15_000_000, startingCapital: 1000 } as any),
    5000,
  );
  assert.equal(
    effectiveCapitalForSizing({ capital: 800, startingCapital: 1000 } as any),
    800,
  );
}

function testClampTradeRealizedPnlForReconcile() {
  assert.equal(clampTradeRealizedPnlForReconcile(11_939_115, 1000), 5000);
  assert.equal(clampTradeRealizedPnlForReconcile(-50, 1000), -50);
}

function testKillSwitchExitPrice() {
  assert.equal(killSwitchExitPrice(1.12, 63000), 1.12);
  assert.equal(killSwitchExitPrice(63000, 63100), 63100);
}

testValidateEntryVsMarket();
testEffectiveCapitalForSizing();
testClampTradeRealizedPnlForReconcile();
testKillSwitchExitPrice();
console.log("entry-price-sanity.test.ts: ok");
