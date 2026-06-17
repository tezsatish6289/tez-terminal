/**
 * Per-user sliding-window rate limit for chat posts, backed by the
 * `chat_members/{uid}.recentPostTimes` array. Runs in a Firestore transaction
 * so concurrent sends from the same user can't exceed the limit.
 */

import { getAdminFirestore } from "@/firebase/admin";
import {
  CHAT_IMAGE_RATE_LIMIT_COUNT,
  CHAT_IMAGE_RATE_LIMIT_WINDOW_MS,
  CHAT_RATE_LIMIT_COUNT,
  CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/chat/constants";

export interface RateResult {
  ok: boolean;
  retryAfterMs: number;
}

/**
 * Generic sliding-window limiter over a timestamp array field on the user's
 * `chat_members` doc. Runs in a transaction so concurrent calls from the same
 * user can't exceed the limit.
 */
async function checkAndRecord(
  uid: string,
  field: string,
  maxCount: number,
  windowMs: number,
): Promise<RateResult> {
  const db = getAdminFirestore();
  const ref = db.collection("chat_members").doc(uid);
  const now = Date.now();
  const windowStart = now - windowMs;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev: number[] = snap.exists
      ? ((snap.data()?.[field] as number[]) ?? [])
      : [];
    const recent = prev.filter((t) => t > windowStart);

    if (recent.length >= maxCount) {
      const oldest = Math.min(...recent);
      return { ok: false, retryAfterMs: oldest + windowMs - now };
    }

    recent.push(now);
    tx.set(ref, { [field]: recent }, { merge: true });
    return { ok: true, retryAfterMs: 0 };
  });
}

export async function checkAndRecordPost(uid: string): Promise<RateResult> {
  return checkAndRecord(uid, "recentPostTimes", CHAT_RATE_LIMIT_COUNT, CHAT_RATE_LIMIT_WINDOW_MS);
}

/** Stricter, separate budget for image uploads. */
export async function checkAndRecordImageUpload(uid: string): Promise<RateResult> {
  return checkAndRecord(
    uid,
    "recentImageTimes",
    CHAT_IMAGE_RATE_LIMIT_COUNT,
    CHAT_IMAGE_RATE_LIMIT_WINDOW_MS,
  );
}
