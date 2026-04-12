import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, mobile, email, country, message } = body as {
      name?: string;
      mobile?: string;
      email?: string;
      country?: string;
      message?: string;
    };

    if (!name?.trim())    return NextResponse.json({ error: "Name is required" },    { status: 400 });
    if (!email?.trim())   return NextResponse.json({ error: "Email is required" },   { status: 400 });
    if (!country?.trim()) return NextResponse.json({ error: "Country is required" }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const db = getAdminFirestore();

    await db.collection("contact_submissions").add({
      // Encrypted PII
      encryptedName:    encrypt(name.trim()),
      encryptedEmail:   encrypt(email.toLowerCase().trim()),
      encryptedMobile:  encrypt(mobile?.trim() ?? ""),
      // Non-PII — stored plaintext for filtering
      country,
      // Message stored as-is (needed for admin to act on it)
      message: message.trim(),
      // Metadata
      status:    "new",      // new | read | replied
      source:    "freedombot.ai",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
