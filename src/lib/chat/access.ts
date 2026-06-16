/**
 * Server-side community chat access control.
 *
 * The chat read gate (in both Firestore and RTDB security rules) reads a
 * mirrored `canChat` flag rather than querying the subscription on every
 * operation. This module keeps that mirror in sync and resolves access for
 * write paths (with self-healing if the mirror is missing).
 */

import { getAdminDatabase, getAdminFirestore } from "@/firebase/admin";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";
import type { ChatMemberDoc } from "@/lib/chat/types";

export interface ChatAccess {
  canChat: boolean;
  isBanned: boolean;
}

export interface ChatProfile {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

/**
 * Write the `canChat` mirror to both Firestore (`chat_members/{uid}`) and
 * RTDB (`/members/{uid}/canChat`). Optionally refreshes cached profile fields.
 */
export async function syncChatAccess(
  uid: string,
  canChat: boolean,
  profile?: ChatProfile,
): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();

  const update: Partial<ChatMemberDoc> & { userId: string; updatedAt: string } = {
    userId: uid,
    canChat,
    updatedAt: now,
  };
  if (profile?.displayName !== undefined) update.displayName = profile.displayName;
  if (profile?.photoURL !== undefined) update.photoURL = profile.photoURL;

  await db.collection("chat_members").doc(uid).set(update, { merge: true });

  // RTDB mirror — security rules read this for the live stream + presence.
  try {
    await getAdminDatabase().ref(`members/${uid}/canChat`).set(canChat);
  } catch (e) {
    console.error("[chat] RTDB canChat mirror failed", uid, e);
  }
}

/** Derive canChat from a subscription document. */
export function canChatFromSubscription(sub: SubscriptionDoc | null): boolean {
  return isSubscriptionActive(sub);
}

/**
 * Resolve a user's chat access for a write path. Reads the mirror; if it's
 * missing (e.g. user opened chat before the status sync ran), self-heals by
 * deriving from the subscription and writing the mirror.
 */
export async function resolveChatAccess(uid: string): Promise<ChatAccess> {
  const db = getAdminFirestore();
  const memberSnap = await db.collection("chat_members").doc(uid).get();

  if (memberSnap.exists) {
    const data = memberSnap.data() as ChatMemberDoc;
    return {
      canChat: data.canChat === true && data.isBanned !== true,
      isBanned: data.isBanned === true,
    };
  }

  // Self-heal: derive from subscription and persist the mirror.
  const subSnap = await db.collection("subscriptions").doc(uid).get();
  const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
  const canChat = canChatFromSubscription(sub);
  await syncChatAccess(uid, canChat);
  return { canChat, isBanned: false };
}
