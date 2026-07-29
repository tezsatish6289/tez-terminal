/**
 * Server-only flash-sale persistence + Zoho coupon ensure.
 *
 * State doc: `config/fnoninja_flash_sale`
 *   { dateKey, claimedCount, claimedBy?, claimedAt?, couponsSyncedKey? }
 *
 * Coupon leakage controls:
 *  - Day-scoped codes (…_YYYYMMDD)
 *  - Valid-upto = that IST day
 *  - max_redemption capped near daily quota
 *  - Only the current live step’s Silver+Gold coupons stay active
 *  - Legacy undated FN_FLASH_* codes are deactivated
 */

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import {
  FLASH_SALE_DAILY_QUOTA,
  FLASH_SALE_DISCOUNT_STEPS,
  buildFlashSalePublicState,
  flashSaleCouponCode,
  flashSaleCouponForTier,
  flashSaleIstDateKey,
  flashSaleLegacyCouponCodes,
  type FlashSalePublicState,
  type FlashSaleTier,
} from "@/lib/fnoninja/flash-sale";
import {
  ZOHO_PLAN_CODES,
  deactivateFlashSaleCoupon,
  ensureFlashSaleCoupon,
  resolveZohoProductId,
} from "@/lib/zoho/billing";

export const FLASH_SALE_STATE_DOC = "config/fnoninja_flash_sale";

/** Slightly above daily quota so a race doesn’t soft-lock the window. */
const COUPON_MAX_REDEMPTION = Math.max(3, FLASH_SALE_DAILY_QUOTA * 3);

type FlashSaleStateDoc = {
  dateKey?: string;
  claimedCount?: number;
  claimedBy?: string;
  claimedAt?: string;
  claimedSubscriptionId?: string;
  couponsEnsuredAt?: string;
  couponsEnsuredVersion?: string;
  /** `${dateKey}|${stepIndex}|${active?1:0}|${couponGold}` — skip redundant Zoho syncs. */
  couponsSyncedKey?: string;
  legacyCouponsDeactivated?: boolean;
};

async function readStateDoc(): Promise<FlashSaleStateDoc> {
  const snap = await getAdminFirestore().doc(FLASH_SALE_STATE_DOC).get();
  return (snap.exists ? (snap.data() as FlashSaleStateDoc) : {}) ?? {};
}

/** Claimed count for the given IST day (resets automatically when the day rolls). */
export async function getFlashSaleClaimedCount(dateKey: string): Promise<number> {
  const doc = await readStateDoc();
  if (doc.dateKey !== dateKey) return 0;
  return Math.max(0, Number(doc.claimedCount) || 0);
}

export async function getFlashSalePublicState(
  nowMs: number = Date.now(),
): Promise<FlashSalePublicState> {
  const dateKey = flashSaleIstDateKey(nowMs);
  const claimedCount = await getFlashSaleClaimedCount(dateKey);
  return buildFlashSalePublicState({ nowMs, claimedCount, dailyQuota: FLASH_SALE_DAILY_QUOTA });
}

async function deactivateLegacyFlashCoupons(): Promise<void> {
  for (const code of flashSaleLegacyCouponCodes()) {
    await deactivateFlashSaleCoupon(code);
  }
}

/**
 * Sync Zoho coupons to the current flash window.
 * - Live window → ensure only today’s Silver+Gold codes for the active step
 * - Otherwise → do not create; keep legacy codes inactive
 */
export async function ensureFlashSaleCoupons(nowMs: number = Date.now()): Promise<void> {
  const state = await getFlashSalePublicState(nowMs);
  const syncKey = `${state.dateKey}|${state.stepIndex}|${state.active ? 1 : 0}|${state.couponCodeGold ?? "-"}`;

  const doc = await readStateDoc();
  if (doc.couponsSyncedKey === syncKey && doc.legacyCouponsDeactivated) return;

  // Always kill undated / old ladder codes once (and again if sync key changes).
  if (!doc.legacyCouponsDeactivated || doc.couponsSyncedKey !== syncKey) {
    await deactivateLegacyFlashCoupons();
  }

  if (state.active && state.couponCodeGold && state.couponCodeSilver) {
    const productId = await resolveZohoProductId();
    if (!productId) {
      console.warn("[FlashSale] No Zoho product_id — cannot ensure coupons");
      return;
    }

    await ensureFlashSaleCoupon({
      couponCode: state.couponCodeGold,
      discountInr: state.discountGoldInr,
      productId,
      planCodes: [ZOHO_PLAN_CODES.gold],
      expiryAt: state.dateKey,
      maxRedemption: COUPON_MAX_REDEMPTION,
    });
    await ensureFlashSaleCoupon({
      couponCode: state.couponCodeSilver,
      discountInr: state.discountSilverInr,
      productId,
      planCodes: [ZOHO_PLAN_CODES.silver],
      expiryAt: state.dateKey,
      maxRedemption: COUPON_MAX_REDEMPTION,
    });

    // Deactivate other undated step codes already covered by legacy list; also
    // deactivate other dated codes for this day that are not the active pair.
    for (const step of FLASH_SALE_DISCOUNT_STEPS) {
      const g = flashSaleCouponCode("gold", step.gold, state.dateKey);
      const s = flashSaleCouponCode("silver", step.silver, state.dateKey);
      if (g !== state.couponCodeGold) await deactivateFlashSaleCoupon(g);
      if (s !== state.couponCodeSilver) await deactivateFlashSaleCoupon(s);
    }
  }

  await getAdminFirestore().doc(FLASH_SALE_STATE_DOC).set(
    {
      couponsEnsuredAt: new Date().toISOString(),
      couponsEnsuredVersion: "day-scoped-v2",
      couponsSyncedKey: syncKey,
      legacyCouponsDeactivated: true,
    },
    { merge: true },
  );
}

/**
 * Marks one daily flash-sale spot as claimed after a Silver/Gold payment.
 * Idempotent per uid for the day. Returns whether this call consumed a new spot.
 */
export async function claimFlashSaleSpot(args: {
  uid: string;
  subscriptionId?: string;
  nowMs?: number;
}): Promise<{ claimed: boolean; spotsLeft: number }> {
  const nowMs = args.nowMs ?? Date.now();
  const dateKey = flashSaleIstDateKey(nowMs);
  const db = getAdminFirestore();
  const ref = db.doc(FLASH_SALE_STATE_DOC);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? (snap.data() as FlashSaleStateDoc) : {}) ?? {};
    const sameDay = data.dateKey === dateKey;
    const claimedCount = sameDay ? Math.max(0, Number(data.claimedCount) || 0) : 0;

    if (
      sameDay &&
      (data.claimedBy === args.uid ||
        (args.subscriptionId && data.claimedSubscriptionId === args.subscriptionId))
    ) {
      return {
        claimed: false,
        spotsLeft: Math.max(0, FLASH_SALE_DAILY_QUOTA - claimedCount),
      };
    }

    if (claimedCount >= FLASH_SALE_DAILY_QUOTA) {
      return { claimed: false, spotsLeft: 0 };
    }

    const next = claimedCount + 1;
    tx.set(
      ref,
      {
        dateKey,
        claimedCount: next,
        claimedBy: args.uid,
        claimedSubscriptionId: args.subscriptionId ?? null,
        claimedAt: new Date(nowMs).toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      claimed: true,
      spotsLeft: Math.max(0, FLASH_SALE_DAILY_QUOTA - next),
    };
  });
}

/** Active flash coupon code for a checkout tier, or null if sale is not live. */
export async function getActiveFlashSaleCouponCode(
  tier: FlashSaleTier,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const state = await getFlashSalePublicState(nowMs);
  return flashSaleCouponForTier(state, tier);
}
