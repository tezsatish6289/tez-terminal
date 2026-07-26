import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { isEmailUpdatesEnabled } from "@/lib/email/fnoninja-audience";
import { resendConfig, resendSetContactUnsubscribed } from "@/lib/email/resend";
import { requireUser } from "@/lib/chat/require-user";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/fnoninja/email-preferences
 * Opt-in-by-default win-story / product update emails (Resend Broadcasts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(auth.decoded.uid).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    emailUpdatesEnabled: isEmailUpdatesEnabled(data),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { emailUpdatesEnabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.emailUpdatesEnabled !== "boolean") {
    return NextResponse.json({ error: "emailUpdatesEnabled must be a boolean" }, { status: 400 });
  }

  const uid = auth.decoded.uid;
  const enabled = body.emailUpdatesEnabled;
  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const email =
    (typeof data.email === "string" && data.email) ||
    (typeof auth.decoded.email === "string" && auth.decoded.email) ||
    "";

  await userRef.set(
    {
      emailUpdatesEnabled: enabled,
      emailUpdatesUpdatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  // Mirror opt-out to Resend so Broadcasts honor it even if the contact stays in the segment.
  const cfg = resendConfig();
  if (cfg.apiKey && email.includes("@")) {
    const mirrored = await resendSetContactUnsubscribed({
      apiKey: cfg.apiKey,
      email: email.trim().toLowerCase(),
      unsubscribed: !enabled,
      segmentId: cfg.segmentId || undefined,
    });
    if (!mirrored.ok) {
      console.warn("[fnoninja/email-preferences] Resend mirror failed:", mirrored.error);
    }
  }

  return NextResponse.json({ emailUpdatesEnabled: enabled });
}
