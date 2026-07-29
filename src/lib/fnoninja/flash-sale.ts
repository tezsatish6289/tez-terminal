/**
 * FNONINJA flash-sale schedule + public types.
 *
 * Pure helpers (safe for client + server). Persistence / Zoho coupons live in
 * `flash-sale-server.ts`.
 *
 * Windows: from 09:15 IST, 15 min live → 45 min cooldown, cycling until the
 * daily quota is claimed.
 *
 * Discount ladder is pro-rated by plan price (Silver ₹4500 / Gold ₹7200):
 *   Gold ₹500→₹1500, Silver ₹300→₹1000.
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

/** Per-step discounts (INR). Caps at the last step for later windows. */
export const FLASH_SALE_DISCOUNT_STEPS = [
  { gold: 500, silver: 300 },
  { gold: 750, silver: 500 },
  { gold: 1000, silver: 650 },
  { gold: 1250, silver: 800 },
  { gold: 1500, silver: 1000 },
] as const;

/** @deprecated Prefer FLASH_SALE_DISCOUNT_STEPS — Gold amounts for display/ladder index. */
export const FLASH_SALE_DISCOUNT_STEPS_INR = FLASH_SALE_DISCOUNT_STEPS.map((s) => s.gold);

export const FLASH_SALE_BUBBLE_ID = "flash-sale";

export type FlashSaleTier = "silver" | "gold";

export type FlashSalePublicState = {
  active: boolean;
  /** IST calendar day `YYYY-MM-DD`. */
  dateKey: string;
  /** Gold discount (also used as the bubble headline “upto” amount). */
  discountInr: number;
  discountGoldInr: number;
  discountSilverInr: number;
  /** Zoho coupon codes when active (never expose when inactive). */
  couponCode: string | null;
  couponCodeGold: string | null;
  couponCodeSilver: string | null;
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

export function flashSaleCouponCode(tier: FlashSaleTier, discountInr: number): string {
  const prefix = tier === "gold" ? "G" : "S";
  return `FN_FLASH_${prefix}_${discountInr}`;
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

export function discountsForStepIndex(stepIndex: number): { gold: number; silver: number } {
  const steps = FLASH_SALE_DISCOUNT_STEPS;
  if (stepIndex <= 0) return { gold: steps[0].gold, silver: steps[0].silver };
  if (stepIndex >= steps.length) {
    const last = steps[steps.length - 1];
    return { gold: last.gold, silver: last.silver };
  }
  const step = steps[stepIndex];
  return { gold: step.gold, silver: step.silver };
}

/** @deprecated Use discountsForStepIndex — returns Gold amount. */
export function discountForStepIndex(stepIndex: number): number {
  return discountsForStepIndex(stepIndex).gold;
}

export type FlashSaleSchedule = {
  dateKey: string;
  /** True when inside a live 15-min window after 09:15 IST. */
  inWindow: boolean;
  stepIndex: number;
  discountGoldInr: number;
  discountSilverInr: number;
  /** Alias of discountGoldInr (bubble headline). */
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
    const d = discountsForStepIndex(0);
    return {
      dateKey,
      inWindow: false,
      stepIndex: 0,
      discountGoldInr: d.gold,
      discountSilverInr: d.silver,
      discountInr: d.gold,
      endsAtMs: null,
      nextStartsAtMs: dayStart,
    };
  }

  const elapsed = nowMs - dayStart;
  const stepIndex = Math.floor(elapsed / cycleMs);
  const offsetInCycle = elapsed % cycleMs;
  const d = discountsForStepIndex(stepIndex);
  const cycleStart = dayStart + stepIndex * cycleMs;

  if (offsetInCycle < windowMs) {
    return {
      dateKey,
      inWindow: true,
      stepIndex,
      discountGoldInr: d.gold,
      discountSilverInr: d.silver,
      discountInr: d.gold,
      endsAtMs: cycleStart + windowMs,
      nextStartsAtMs: cycleStart + cycleMs,
    };
  }

  const next = discountsForStepIndex(stepIndex + 1);
  return {
    dateKey,
    inWindow: false,
    stepIndex,
    discountGoldInr: next.gold,
    discountSilverInr: next.silver,
    discountInr: next.gold,
    endsAtMs: null,
    nextStartsAtMs: cycleStart + cycleMs,
  };
}

function inactivePublicState(
  schedule: FlashSaleSchedule,
  spotsLeft: number,
  dailyQuota: number,
  nextStartsAt: string | null,
): FlashSalePublicState {
  return {
    active: false,
    dateKey: schedule.dateKey,
    discountInr: schedule.discountInr,
    discountGoldInr: schedule.discountGoldInr,
    discountSilverInr: schedule.discountSilverInr,
    couponCode: null,
    couponCodeGold: null,
    couponCodeSilver: null,
    spotsLeft,
    dailyQuota,
    endsAt: null,
    nextStartsAt,
    stepIndex: schedule.stepIndex,
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
    return inactivePublicState(schedule, 0, dailyQuota, null);
  }

  if (!schedule.inWindow || schedule.endsAtMs == null) {
    return inactivePublicState(
      schedule,
      spotsLeft,
      dailyQuota,
      schedule.nextStartsAtMs != null
        ? new Date(schedule.nextStartsAtMs).toISOString()
        : null,
    );
  }

  const couponCodeGold = flashSaleCouponCode("gold", schedule.discountGoldInr);
  const couponCodeSilver = flashSaleCouponCode("silver", schedule.discountSilverInr);

  return {
    active: true,
    dateKey: schedule.dateKey,
    discountInr: schedule.discountGoldInr,
    discountGoldInr: schedule.discountGoldInr,
    discountSilverInr: schedule.discountSilverInr,
    couponCode: couponCodeGold,
    couponCodeGold,
    couponCodeSilver,
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

export function flashSaleDiscountForTier(
  state: Pick<FlashSalePublicState, "discountGoldInr" | "discountSilverInr" | "discountInr">,
  tier: FlashSaleTier,
): number {
  if (tier === "silver") return state.discountSilverInr ?? Math.round((state.discountInr * 4500) / 7200);
  return state.discountGoldInr ?? state.discountInr;
}

export function flashSaleCouponForTier(
  state: Pick<FlashSalePublicState, "active" | "couponCodeGold" | "couponCodeSilver" | "couponCode">,
  tier: FlashSaleTier,
): string | null {
  if (!state.active) return null;
  if (tier === "silver") return state.couponCodeSilver ?? null;
  return state.couponCodeGold ?? state.couponCode ?? null;
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
