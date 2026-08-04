/**
 * Server-only: post Atlas's once-per-user welcome into General.
 */

import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import {
  ATLAS_AUTHOR_NAME,
  ATLAS_AUTHOR_PHOTO,
  ATLAS_SYSTEM_AUTHOR_ID,
  buildAtlasWelcomeText,
  resolveWelcomeHandle,
} from "@/lib/chat/atlas-welcome";
import { GENERAL_ROOM_ID } from "@/lib/chat/constants";
import { parseUserMentions } from "@/lib/chat/moderation";
import { createMessage } from "@/lib/chat/store";

export interface SendAtlasWelcomeInput {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export interface SendAtlasWelcomeResult {
  sent: boolean;
  messageId: string | null;
  skippedReason?: "already_welcomed" | "create_failed";
}

/**
 * Claim the once-per-user welcome slot, then post Atlas into General.
 * Safe to call on every terms accept — duplicates are skipped.
 */
export async function sendAtlasWelcomeIfNeeded(
  input: SendAtlasWelcomeInput,
): Promise<SendAtlasWelcomeResult> {
  const db = getAdminFirestore();
  const memberRef = db.collection("chat_members").doc(input.uid);
  const now = new Date().toISOString();

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(memberRef);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    if (typeof data.welcomeSentAt === "string" && data.welcomeSentAt.length > 0) {
      return false;
    }
    tx.set(
      memberRef,
      {
        userId: input.uid,
        welcomeSentAt: now,
      },
      { merge: true },
    );
    return true;
  });

  if (!claimed) {
    return { sent: false, messageId: null, skippedReason: "already_welcomed" };
  }

  const handle = resolveWelcomeHandle(input.displayName, input.email);
  const text = buildAtlasWelcomeText(handle);

  try {
    const msg = await createMessage({
      roomId: GENERAL_ROOM_ID,
      authorId: ATLAS_SYSTEM_AUTHOR_ID,
      authorName: ATLAS_AUTHOR_NAME,
      authorPhoto: ATLAS_AUTHOR_PHOTO,
      text,
      mentions: parseUserMentions(text),
      flagged: false,
    });

    await memberRef.set({ welcomeMessageId: msg.id }, { merge: true });
    return { sent: true, messageId: msg.id };
  } catch (e) {
    console.error(
      "[atlas-welcome] createMessage failed",
      e instanceof Error ? e.message : e,
    );
    // Release the claim so a later accept / retry can try again.
    await memberRef
      .set({ welcomeSentAt: null, welcomeMessageId: null }, { merge: true })
      .catch(() => undefined);
    return { sent: false, messageId: null, skippedReason: "create_failed" };
  }
}
