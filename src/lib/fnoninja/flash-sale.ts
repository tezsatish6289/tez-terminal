/**
 * FNONINJA flash-sale schedule + public types.
 *
 * Pure helpers (safe for client + server). Persistence / Zoho coupons live in
 * `flash-sale-server.ts`.
 *
 * Windows: from 09:15 IST, 15 min live → 45 min cooldown, cycling until the
 * daily quota is claimed. Discount ladder: ₹500 → ₹1500.
 */

/** Easy to tweak — spots available per IST calendar day. */
export const FLASH_SALE_DAILY_QUOTA = 1;

/** Live window length (minutes). */
export const FLASH_SALE_WINDOW_MINUTES = 15;

/** Hidden cooldown between windows (minutes). */
export const FLASH_SALE_COOLDOWN_MINUTES = 45;

/** First window of the IST day starts at 09:15. */
export const FLASH_SALE_START_HOUR_IST = 9;
export const FLASH_SALE_START_MINUTE_IST = 15;

/** Discount ladder (INR). Caps at the last step for later windows. */
export const FLASH_SALE_DISCOUNT_STEPS_INR = [500, 750, 1000, 1250, 1500] as const;

export const FLASH_SALE_BUBBLE_ID = "flash-sale";

export type FlashSalePublicState = {
  active: boolean;
  /** IST calendar day `YYYY-MM-DD`. */
  dateKey: string;
  discountInr: number;
  /** Zoho coupon code when active (never expose when inactive). */
  couponCode: string | null;
  spotsLeft: number;
  dailyQuota: number;
  /** ISO timestamp when the current live window ends (null if inactive). */
  endsAt: string | null;
  /** ISO timestamp when the next live window starts (null if sold out / none). */
  nextStartsAt: string | null;
  /** Current ladder step index (0-based). */
  stepIndex: number;
};

const IST_OFFSET_MS = 5.5 * 3600_000;
const MIN_MS = 60_000;

/** IST calendar-day key `YYYY-MM-DD` (mirrors `istDateKey` in iv-history). */
export function flashSaleIstDateKey(nowMs: number): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function flashSaleCouponCode(discountInr: number): string {
  return `FN_FLASH_${discountInr}`;
}

export function isFlashSaleBubbleId(id: string): boolean {
  return id === FLASH_SALE_BUBBLE_ID;
}

/** IST wall-clock parts for a UTC ms instant. */
export function istParts(nowMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    second: ist.getUTCSeconds(),
  };
}

/** UTC ms for an IST civil datetime. */
export function istWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
}

export function flashSaleDayStartUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return istWallTimeToUtcMs(
    y,
    m,
    d,
    FLASH_SALE_START_HOUR_IST,
    FLASH_SALE_START_MINUTE_IST,
  );
}

export function discountForStepIndex(stepIndex: number): number {
  const steps = FLASH_SALE_DISCOUNT_STEPS_INR;
  if (stepIndex <= 0) return steps[0];
  if (stepIndex >= steps.length) return steps[steps.length - 1];
  return steps[stepIndex];
}

export type FlashSaleSchedule = {
  dateKey: string;
  /** True when inside a live 15-min window after 09:15 IST. */
  inWindow: boolean;
  stepIndex: number;
  discountInr: number;
  endsAtMs: number | null;
  nextStartsAtMs: number | null;
};

/**
 * Computes the schedule for `nowMs` ignoring quota/claims.
 * Before 09:15 IST the offer is not running for that day.
 */
export function computeFlashSaleSchedule(nowMs: number = Date.now()): FlashSaleSchedule {
  const dateKey = flashSaleIstDateKey(nowMs);
  const dayStart = flashSaleDayStartUtcMs(dateKey);
  const cycleMs =
    (FLASH_SALE_WINDOW_MINUTES + FLASH_SALE_COOLDOWN_MINUTES) * MIN_MS;
  const windowMs = FLASH_SALE_WINDOW_MINUTES * MIN_MS;

  if (nowMs < dayStart) {
    return {
      dateKey,
      inWindow: false,
      stepIndex: 0,
      discountInr: discountForStepIndex(0),
      endsAtMs: null,
      nextStartsAtMs: dayStart,
    };
  }

  const elapsed = nowMs - dayStart;
  const stepIndex = Math.floor(elapsed / cycleMs);
  const offsetInCycle = elapsed % cycleMs;
  const discountInr = discountForStepIndex(stepIndex);
  const cycleStart = dayStart + stepIndex * cycleMs;

  if (offsetInCycle < windowMs) {
    return {
      dateKey,
      inWindow: true,
      stepIndex,
      discountInr,
      endsAtMs: cycleStart + windowMs,
      nextStartsAtMs: cycleStart + cycleMs,
    };
  }

  return {
    dateKey,
    inWindow: false,
    stepIndex,
    discountInr: discountForStepIndex(stepIndex + 1),
    endsAtMs: null,
    nextStartsAtMs: cycleStart + cycleMs,
  };
}

export function buildFlashSalePublicState(args: {
  nowMs?: number;
  claimedCount: number;
  dailyQuota?: number;
}): FlashSalePublicState {
  const nowMs = args.nowMs ?? Date.now();
  const dailyQuota = args.dailyQuota ?? FLASH_SALE_DAILY_QUOTA;
  const claimedCount = Math.max(0, args.claimedCount);
  const spotsLeft = Math.max(0, dailyQuota - claimedCount);
  const schedule = computeFlashSaleSchedule(nowMs);

  if (spotsLeft <= 0) {
    return {
      active: false,
      dateKey: schedule.dateKey,
      discountInr: schedule.discountInr,
      couponCode: null,
      spotsLeft: 0,
      dailyQuota,
      endsAt: null,
      nextStartsAt: null,
      stepIndex: schedule.stepIndex,
    };
  }

  if (!schedule.inWindow || schedule.endsAtMs == null) {
    return {
      active: false,
      dateKey: schedule.dateKey,
      discountInr: schedule.discountInr,
      couponCode: null,
      spotsLeft,
      dailyQuota,
      endsAt: null,
      nextStartsAt:
        schedule.nextStartsAtMs != null
          ? new Date(schedule.nextStartsAtMs).toISOString()
          : null,
      stepIndex: schedule.stepIndex,
    };
  }

  return {
    active: true,
    dateKey: schedule.dateKey,
    discountInr: schedule.discountInr,
    couponCode: flashSaleCouponCode(schedule.discountInr),
    spotsLeft,
    dailyQuota,
    endsAt: new Date(schedule.endsAtMs).toISOString(),
    nextStartsAt:
      schedule.nextStartsAtMs != null
        ? new Date(schedule.nextStartsAtMs).toISOString()
        : null,
    stepIndex: schedule.stepIndex,
  };
}

/** Format mm:ss remaining until `endsAt` ISO (clamped at 0). */
export function formatFlashSaleCountdown(endsAtIso: string | null, nowMs = Date.now()): string {
  if (!endsAtIso) return "00:00";
  const remaining = Math.max(0, new Date(endsAtIso).getTime() - nowMs);
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
