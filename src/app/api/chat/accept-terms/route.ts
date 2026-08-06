import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { sendAtlasWelcomeIfNeeded } from "@/lib/chat/send-atlas-welcome";
import { requireUser } from "@/lib/chat/require-user";
import { trackTrialActivity } from "@/lib/fnoninja/trial-activity";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/accept-terms
 * Records that the user accepted the community-chat terms, then (once) has
 * Atlas welcome them in General and ask for a short intro.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { uid, name, email } = auth.decoded;
  const displayName = typeof name === "string" ? name : null;
  const userEmail = typeof email === "string" ? email : null;

  const db = getAdminFirestore();
  await db
    .collection("chat_members")
    .doc(uid)
    .set(
      {
        userId: uid,
        acceptedTermsAt: new Date().toISOString(),
        ...(displayName ? { displayName } : {}),
      },
      { merge: true },
    );

  trackTrialActivity(db, uid, "chat_joined");

  const welcome = await sendAtlasWelcomeIfNeeded({
    uid,
    displayName,
    email: userEmail,
  });

  return NextResponse.json({
    ok: true,
    welcomeSent: welcome.sent,
    welcomeMessageId: welcome.messageId,
  });
}
