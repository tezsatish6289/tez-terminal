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
  FLASH_SALE_DISCOUNT_STEPS_INR,
  buildFlashSalePublicState,
  flashSaleCouponCode,
  flashSaleIstDateKey,
  type FlashSalePublicState,
} from "@/lib/fnoninja/flash-sale";
import {
  ZOHO_PLAN_CODES,
  ensureFlashSaleCoupon,
  resolveZohoProductId,
} from "@/lib/zoho/billing";

export const FLASH_SALE_STATE_DOC = "config/fnoninja_flash_sale";

type FlashSaleStateDoc = {
  dateKey?: string;
  claimedCount?: number;
  claimedBy?: string;
  claimedAt?: string;
  claimedSubscriptionId?: string;
  couponsEnsuredAt?: string;
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
 * Ensures Zoho coupons exist for every ladder step (idempotent).
 * Best-effort — checkout still works if a coupon was created earlier.
 */
export async function ensureFlashSaleCoupons(): Promise<void> {
  const doc = await readStateDoc();
  // Re-check at most once per day unless never ensured.
  const today = flashSaleIstDateKey(Date.now());
  if (doc.couponsEnsuredAt && doc.couponsEnsuredAt.slice(0, 10) === today) {
    // Still verify the active step's coupon exists (cheap GET).
  }

  const productId = await resolveZohoProductId();
  if (!productId) {
    console.warn("[FlashSale] No Zoho product_id — cannot ensure coupons");
    return;
  }

  const planCodes = [ZOHO_PLAN_CODES.silver, ZOHO_PLAN_CODES.gold];
  for (const discountInr of FLASH_SALE_DISCOUNT_STEPS_INR) {
    await ensureFlashSaleCoupon({
      couponCode: flashSaleCouponCode(discountInr),
      discountInr,
      productId,
      planCodes,
    });
  }

  await getAdminFirestore().doc(FLASH_SALE_STATE_DOC).set(
    { couponsEnsuredAt: new Date().toISOString() },
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

/** Active flash coupon code for checkout, or null if sale is not live / sold out. */
export async function getActiveFlashSaleCouponCode(
  nowMs: number = Date.now(),
): Promise<string | null> {
  const state = await getFlashSalePublicState(nowMs);
  return state.active ? state.couponCode : null;
}
