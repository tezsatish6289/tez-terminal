/**
 * Reconcile community-chat access mirror with subscription state.
 *
 * Safety net in case a subscription webhook or expiry cron was missed: walks
 * every subscription, recomputes whether the user can chat, and rewrites the
 * `chat_members/{uid}.canChat` (Firestore) + `/members/{uid}/canChat` (RTDB)
 * mirrors so the chat read gate matches reality.
 *
 * Usage:
 *   FIREBASE_DATABASE_URL=https://...firebasedatabase.app \
 *     npx tsx scripts/reconcile-chat-access.ts
 *
 * Idempotent — safe to run on a schedule.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { isSubscriptionActive, type SubscriptionDoc } from "../src/lib/subscription";

const PROJECT_ID = "studio-6235588950-a15f2";
const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  "https://studio-6235588950-a15f2-default-rtdb.asia-southeast1.firebasedatabase.app";

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
}

const db = getFirestore();
const rtdb = getDatabase();

async function reconcile() {
  const snap = await db.collection("subscriptions").get();
  console.log(`[reconcile] ${snap.size} subscriptions`);

  let changed = 0;
  const now = new Date().toISOString();

  for (const doc of snap.docs) {
    const uid = doc.id;
    const sub = doc.data() as SubscriptionDoc;
    const canChat = isSubscriptionActive(sub);

    const memberSnap = await db.collection("chat_members").doc(uid).get();
    const current = memberSnap.exists ? memberSnap.data()?.canChat === true : null;

    if (current === canChat) continue;

    await db
      .collection("chat_members")
      .doc(uid)
      .set({ userId: uid, canChat, updatedAt: now }, { merge: true });
    await rtdb.ref(`members/${uid}/canChat`).set(canChat);
    changed++;
    console.log(`[reconcile] ${uid}: canChat ${current} -> ${canChat}`);
  }

  console.log(`[reconcile] done — ${changed} updated`);
}

reconcile()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[reconcile] failed", e);
    process.exit(1);
  });
