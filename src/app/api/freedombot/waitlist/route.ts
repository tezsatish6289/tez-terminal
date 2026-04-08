import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email, bot } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    await db
      .collection("waitlist")
      .doc(`${bot || "unknown"}_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`)
      .set(
        {
          email: email.toLowerCase().trim(),
          bot: bot || "unknown",
          joinedAt: new Date().toISOString(),
          source: "freedombot.ai",
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[FreedomBot Waitlist]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
