import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/accept-terms
 * Records that the user accepted the community-chat terms.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await getAdminFirestore()
    .collection("chat_members")
    .doc(auth.decoded.uid)
    .set(
      { userId: auth.decoded.uid, acceptedTermsAt: new Date().toISOString() },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}
