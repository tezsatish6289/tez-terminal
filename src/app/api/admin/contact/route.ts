import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!ADMIN_EMAILS.has(decoded.email ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getAdminFirestore();
    const snap = await db
      .collection("contact_submissions")
      .orderBy("createdAt", "desc")
      .get();

    const submissions = snap.docs.map((doc) => {
      const d = doc.data();
      let name = "—", email = "—", mobile = "—";
      try { name   = decrypt(d.encryptedName  ?? ""); } catch { name  = "[encrypted]"; }
      try { email  = decrypt(d.encryptedEmail ?? ""); } catch { email = "[encrypted]"; }
      try { mobile = decrypt(d.encryptedMobile ?? ""); } catch { mobile = "—"; }
      return {
        id:        doc.id,
        name,
        email,
        mobile:    mobile || "—",
        country:   d.country   ?? "—",
        message:   d.message   ?? "—",
        status:    d.status    ?? "new",
        source:    d.source    ?? "—",
        createdAt: d.createdAt ?? null,
      };
    });

    return NextResponse.json({ submissions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — update status (new → read → replied)
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!ADMIN_EMAILS.has(decoded.email ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, status } = await request.json() as { id?: string; status?: string };
    if (!id || !["new", "read", "replied"].includes(status ?? "")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = getAdminFirestore();
    await db.collection("contact_submissions").doc(id).update({ status });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
