import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { encrypt, decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

// ─── POST — submit waitlist entry ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, mobile, country, assetTypes } = body as {
      name?: string;
      email?: string;
      mobile?: string;
      country?: string;
      assetTypes?: string[];
    };

    if (!name?.trim())  return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!country?.trim()) return NextResponse.json({ error: "Country is required" }, { status: 400 });
    if (!assetTypes?.length) return NextResponse.json({ error: "Select at least one asset type" }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Dedup by email — use a stable doc ID derived from the email
    const docId = `wl_${Buffer.from(email.toLowerCase().trim()).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`;

    // Encrypt all PII fields
    await db.collection("waitlist").doc(docId).set({
      // Plaintext (analytics, not personal)
      country,
      assetTypes,
      source: "freedombot.ai",
      joinedAt: new Date().toISOString(),
      // Encrypted PII
      encryptedName:   encrypt(name.trim()),
      encryptedEmail:  encrypt(email.toLowerCase().trim()),
      encryptedMobile: encrypt(mobile?.trim() ?? ""),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — admin only, returns decrypted entries ──────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Verify Firebase ID token and check admin email server-side
    const authHeader = request.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!ADMIN_EMAILS.has(decoded.email ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getAdminFirestore();
    const snap = await db.collection("waitlist").orderBy("joinedAt", "desc").get();

    const entries = snap.docs.map((doc) => {
      const d = doc.data();
      let name = "—", email = "—", mobile = "—";
      try { name   = decrypt(d.encryptedName ?? "");   } catch { name = "[encrypted]"; }
      try { email  = decrypt(d.encryptedEmail ?? "");  } catch { email = "[encrypted]"; }
      try { mobile = decrypt(d.encryptedMobile ?? ""); } catch { mobile = "—"; }
      return {
        id: doc.id,
        name,
        email,
        mobile: mobile || "—",
        country: d.country ?? "—",
        assetTypes: d.assetTypes ?? [],
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
