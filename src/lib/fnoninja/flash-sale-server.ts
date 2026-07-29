/**
 * Server-only flash-sale persistence + Zoho coupon ensure.
 *
 * State doc: `config/fnoninja_flash_sale`
 *   { dateKey, claimedCount, claimedBy?, claimedAt?, couponsEnsuredAt? }
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
  type FlashSalePublicState,
  type FlashSaleTier,
} from "@/lib/fnoninja/flash-sale";
import {
  ZOHO_PLAN_CODES,
  ensureFlashSaleCoupon,
  resolveZohoProductId,
} from "@/lib/zoho/billing";

export const FLASH_SALE_STATE_DOC = "config/fnoninja_flash_sale";

/** Bump when coupon codes / ladder change so Zoho ensure re-runs. */
const COUPONS_ENSURE_VERSION = "tiered-v1";

type FlashSaleStateDoc = {
  dateKey?: string;
  claimedCount?: number;
  claimedBy?: string;
  claimedAt?: string;
  claimedSubscriptionId?: string;
  couponsEnsuredAt?: string;
  couponsEnsuredVersion?: string;
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

/**
 * Ensures Zoho coupons exist for every ladder step × tier (idempotent).
 * Silver and Gold get separate flat coupons so discounts can be pro-rated.
 */
export async function ensureFlashSaleCoupons(): Promise<void> {
  const doc = await readStateDoc();
  if (doc.couponsEnsuredVersion === COUPONS_ENSURE_VERSION) return;

  const productId = await resolveZohoProductId();
  if (!productId) {
    console.warn("[FlashSale] No Zoho product_id — cannot ensure coupons");
    return;
  }

  for (const step of FLASH_SALE_DISCOUNT_STEPS) {
    await ensureFlashSaleCoupon({
      couponCode: flashSaleCouponCode("gold", step.gold),
      discountInr: step.gold,
      productId,
      planCodes: [ZOHO_PLAN_CODES.gold],
    });
    await ensureFlashSaleCoupon({
      couponCode: flashSaleCouponCode("silver", step.silver),
      discountInr: step.silver,
      productId,
      planCodes: [ZOHO_PLAN_CODES.silver],
    });
  }

  await getAdminFirestore().doc(FLASH_SALE_STATE_DOC).set(
    {
      couponsEnsuredAt: new Date().toISOString(),
      couponsEnsuredVersion: COUPONS_ENSURE_VERSION,
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
