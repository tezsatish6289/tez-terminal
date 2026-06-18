import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { getNextWebinarSession } from "@/lib/fnoninja/webinar";

export const dynamic = "force-dynamic";

const COLLECTION = "webinarRegistrations";

// ─── POST — register for the free webinar (public, no auth) ───────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, mobile, sessionDate, source } = body as {
      name?: string;
      email?: string;
      mobile?: string;
      sessionDate?: string;
      source?: string;
    };

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (!mobile?.trim()) {
      return NextResponse.json({ error: "Mobile number is required" }, { status: 400 });
    }

    const session = getNextWebinarSession();
    const istDate = sessionDate?.trim() || session.istDate;

    const db = getAdminFirestore();
    const emailKey = Buffer.from(email.toLowerCase().trim())
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 40);
    // One registration per email per session date.
    const docId = `wb_${emailKey}_${istDate.replace(/[^0-9]/g, "")}`;

    await db
      .collection(COLLECTION)
      .doc(docId)
      .set(
        {
          sessionDate: istDate,
          source: source?.trim() || "fnoninja.com/webinar",
          joinedAt: new Date().toISOString(),
          encryptedName: encrypt(name.trim()),
          encryptedEmail: encrypt(email.toLowerCase().trim()),
          encryptedMobile: encrypt(mobile.trim()),
        },
        { merge: true },
      );

    return NextResponse.json({ success: true, sessionDate: istDate });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — admin only, returns decrypted registrations ────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTION).orderBy("joinedAt", "desc").get();

    const entries = snap.docs.map((doc) => {
      const d = doc.data();
      let name = "—", email = "—", mobile = "—";
      try { name = decrypt(d.encryptedName ?? ""); } catch { name = "[encrypted]"; }
      try { email = decrypt(d.encryptedEmail ?? ""); } catch { email = "[encrypted]"; }
      try { mobile = decrypt(d.encryptedMobile ?? ""); } catch { mobile = "—"; }
      return {
        id: doc.id,
        name,
        email,
        mobile: mobile || "—",
        sessionDate: d.sessionDate ?? "—",
        source: d.source ?? "—",
        joinedAt: d.joinedAt ?? null,
      };
    });

    return NextResponse.json({ entries });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
