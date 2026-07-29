import assert from "node:assert/strict";
import {
  FLASH_SALE_DISCOUNT_STEPS_INR,
  buildFlashSalePublicState,
  computeFlashSaleSchedule,
  discountForStepIndex,
  flashSaleCouponCode,
  flashSaleIstDateKey,
  formatFlashSaleCountdown,
  istWallTimeToUtcMs,
} from "../../src/lib/fnoninja/flash-sale";

// 2026-07-29 09:15 IST = 2026-07-29 03:45 UTC
const DAY_START = istWallTimeToUtcMs(2026, 7, 29, 9, 15);

assert.equal(flashSaleIstDateKey(DAY_START), "2026-07-29");
assert.equal(flashSaleCouponCode(500), "FN_FLASH_500");
assert.equal(discountForStepIndex(0), 500);
assert.equal(discountForStepIndex(4), 1500);
assert.equal(discountForStepIndex(99), 1500);

// Before 09:15 — inactive, next at day start
{
  const s = computeFlashSaleSchedule(DAY_START - 60_000);
  assert.equal(s.inWindow, false);
  assert.equal(s.nextStartsAtMs, DAY_START);
  assert.equal(s.discountInr, 500);
}

// First minute of window 0 — active @ ₹500
{
  const s = computeFlashSaleSchedule(DAY_START + 30_000);
  assert.equal(s.inWindow, true);
  assert.equal(s.stepIndex, 0);
  assert.equal(s.discountInr, 500);
  assert.equal(s.endsAtMs, DAY_START + 15 * 60_000);
}

// 20 min after start — cooldown
{
  const s = computeFlashSaleSchedule(DAY_START + 20 * 60_000);
  assert.equal(s.inWindow, false);
  assert.equal(s.nextStartsAtMs, DAY_START + 60 * 60_000);
}

// Second window (60 min later) — ₹750
{
  const s = computeFlashSaleSchedule(DAY_START + 60 * 60_000 + 5_000);
  assert.equal(s.inWindow, true);
  assert.equal(s.stepIndex, 1);
  assert.equal(s.discountInr, FLASH_SALE_DISCOUNT_STEPS_INR[1]);
}

// Quota claimed → inactive even inside window
{
  const pub = buildFlashSalePublicState({
    nowMs: DAY_START + 30_000,
    claimedCount: 1,
    dailyQuota: 1,
  });
  assert.equal(pub.active, false);
  assert.equal(pub.spotsLeft, 0);
  assert.equal(pub.couponCode, null);
}

// Live window with spots → coupon present
{
  const pub = buildFlashSalePublicState({
    nowMs: DAY_START + 30_000,
    claimedCount: 0,
    dailyQuota: 1,
  });
  assert.equal(pub.active, true);
  assert.equal(pub.couponCode, "FN_FLASH_500");
  assert.equal(pub.spotsLeft, 1);
}

assert.equal(formatFlashSaleCountdown(new Date(DAY_START + 90_000).toISOString(), DAY_START), "01:30");
assert.equal(formatFlashSaleCountdown(null), "00:00");

console.log("flash-sale.test.ts: ok");
