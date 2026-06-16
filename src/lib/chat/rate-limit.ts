/**
 * Per-user sliding-window rate limit for chat posts, backed by the
 * `chat_members/{uid}.recentPostTimes` array. Runs in a Firestore transaction
 * so concurrent sends from the same user can't exceed the limit.
 */

import { getAdminFirestore } from "@/firebase/admin";
import { CHAT_RATE_LIMIT_COUNT, CHAT_RATE_LIMIT_WINDOW_MS } from "@/lib/chat/constants";

export interface RateResult {
  ok: boolean;
  retryAfterMs: number;
}

export async function checkAndRecordPost(uid: string): Promise<RateResult> {
  const db = getAdminFirestore();
  const ref = db.collection("chat_members").doc(uid);
  const now = Date.now();
  const windowStart = now - CHAT_RATE_LIMIT_WINDOW_MS;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev: number[] = snap.exists
      ? ((snap.data()?.recentPostTimes as number[]) ?? [])
      : [];
    const recent = prev.filter((t) => t > windowStart);

    if (recent.length >= CHAT_RATE_LIMIT_COUNT) {
      const oldest = Math.min(...recent);
      return { ok: false, retryAfterMs: oldest + CHAT_RATE_LIMIT_WINDOW_MS - now };
    }

    recent.push(now);
    tx.set(ref, { recentPostTimes: recent }, { merge: true });
    return { ok: true, retryAfterMs: 0 };
  });
}
