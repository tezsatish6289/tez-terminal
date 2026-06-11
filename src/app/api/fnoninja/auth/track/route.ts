import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/auth/track
 * Tags the signed-in user as an FNONINJA product user (idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = getAdminFirestore();
    const ref = db.collection("users").doc(uid);
    const existing = await ref.get();
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null,
      products: FieldValue.arrayUnion("fnoninja"),
      fnoninjaLastSeenAt: now,
      lastSeenAt: now,
    };

    if (!existing.exists || !existing.data()?.fnoninjaJoinedAt) {
      patch.fnoninjaJoinedAt = now;
    }

    if (!existing.exists) {
      patch.signupSource = "fnoninja";
    }

    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Track failed";
    console.error("[FNONINJA Auth Track]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
