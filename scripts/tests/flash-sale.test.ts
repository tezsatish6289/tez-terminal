import assert from "node:assert/strict";
import {
  FLASH_SALE_DISCOUNT_STEPS,
  buildFlashSalePublicState,
  computeFlashSaleSchedule,
  discountForStepIndex,
  discountsForStepIndex,
  flashSaleCouponCode,
  flashSaleCouponForTier,
  flashSaleDiscountForTier,
  flashSaleIstDateKey,
  flashSaleLegacyCouponCodes,
  formatFlashSaleCountdown,
  isFlashSaleBlockedForSubscriber,
  istWallTimeToUtcMs,
} from "../../src/lib/fnoninja/flash-sale";

// 2026-07-29 09:15 IST = 2026-07-29 03:45 UTC
const DAY_START = istWallTimeToUtcMs(2026, 7, 29, 9, 15);

assert.equal(flashSaleIstDateKey(DAY_START), "2026-07-29");
assert.equal(flashSaleCouponCode("gold", 1500, "2026-07-29"), "FN_FLASH_G_1500_20260729");
assert.equal(flashSaleCouponCode("silver", 1000, "2026-07-29"), "FN_FLASH_S_1000_20260729");
assert.ok(flashSaleLegacyCouponCodes().includes("FN_FLASH_1500"));
assert.ok(flashSaleLegacyCouponCodes().includes("FN_FLASH_G_1500"));
assert.equal(discountForStepIndex(0), 500);
assert.equal(discountForStepIndex(4), 1500);
assert.deepEqual(discountsForStepIndex(4), { gold: 1500, silver: 1000 });
assert.deepEqual(discountsForStepIndex(0), { gold: 500, silver: 300 });
assert.equal(FLASH_SALE_DISCOUNT_STEPS.length, 5);

// Before 09:15 — inactive, next at day start
{
  const s = computeFlashSaleSchedule(DAY_START - 60_000);
  assert.equal(s.inWindow, false);
  assert.equal(s.nextStartsAtMs, DAY_START);
  assert.equal(s.discountGoldInr, 500);
  assert.equal(s.discountSilverInr, 300);
}

// First minute of window 0 — active @ ₹500 / ₹300
{
  const s = computeFlashSaleSchedule(DAY_START + 30_000);
  assert.equal(s.inWindow, true);
  assert.equal(s.stepIndex, 0);
  assert.equal(s.discountGoldInr, 500);
  assert.equal(s.discountSilverInr, 300);
  assert.equal(s.endsAtMs, DAY_START + 15 * 60_000);
}

// Second window (60 min later) — ₹750 / ₹500
{
  const s = computeFlashSaleSchedule(DAY_START + 60 * 60_000 + 5_000);
  assert.equal(s.inWindow, true);
  assert.equal(s.stepIndex, 1);
  assert.equal(s.discountGoldInr, 750);
  assert.equal(s.discountSilverInr, 500);
}

// Live window with spots → day-scoped tiered coupons
{
  const pub = buildFlashSalePublicState({
    nowMs: DAY_START + 30_000,
    claimedCount: 0,
    dailyQuota: 1,
  });
  assert.equal(pub.active, true);
  assert.equal(pub.couponCodeGold, "FN_FLASH_G_500_20260729");
  assert.equal(pub.couponCodeSilver, "FN_FLASH_S_300_20260729");
  assert.equal(flashSaleDiscountForTier(pub, "gold"), 500);
  assert.equal(flashSaleDiscountForTier(pub, "silver"), 300);
  assert.equal(flashSaleCouponForTier(pub, "gold"), "FN_FLASH_G_500_20260729");
  assert.equal(flashSaleCouponForTier(pub, "silver"), "FN_FLASH_S_300_20260729");
}

// Cap step: gold 1500 / silver 1000
{
  const late = DAY_START + 4 * 60 * 60_000 + 30_000;
  const pub = buildFlashSalePublicState({ nowMs: late, claimedCount: 0 });
  assert.equal(pub.active, true);
  assert.equal(pub.discountGoldInr, 1500);
  assert.equal(pub.discountSilverInr, 1000);
  assert.equal(pub.couponCodeGold, "FN_FLASH_G_1500_20260729");
}

assert.equal(formatFlashSaleCountdown(new Date(DAY_START + 90_000).toISOString(), DAY_START), "01:30");
assert.equal(formatFlashSaleCountdown(null), "00:00");

assert.equal(isFlashSaleBlockedForSubscriber({ status: "active", tier: "daypass" }), false);
assert.equal(isFlashSaleBlockedForSubscriber({ status: "active", tier: "silver" }), true);
assert.equal(isFlashSaleBlockedForSubscriber({ status: "active", tier: "gold" }), true);
assert.equal(isFlashSaleBlockedForSubscriber({ status: "trial", tier: "free" }), false);
assert.equal(isFlashSaleBlockedForSubscriber({ status: "expired", tier: "daypass" }), false);

console.log("flash-sale.test.ts: ok");
