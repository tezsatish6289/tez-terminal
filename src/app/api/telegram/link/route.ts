import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Generates a one-time link token for connecting a Telegram account.
 * Called from the web app when user clicks "Connect Telegram".
 * Returns a deep link: t.me/TezTerminalBot?start=<token>
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firebaseUid } = body;

    if (!firebaseUid) {
      return NextResponse.json({ error: "Missing firebaseUid" }, { status: 400 });
    }

    const { firestore } = initializeFirebase();

    const token = crypto.randomBytes(24).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min

    await setDoc(doc(firestore, "telegram_link_tokens", token), {
      firebaseUid,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    const deepLink = `https://t.me/TezTerminalBot?start=${token}`;

    return NextResponse.json({ success: true, deepLink, expiresAt: expiresAt.toISOString() });
  } catch (error: any) {
    console.error("[Telegram Link]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
