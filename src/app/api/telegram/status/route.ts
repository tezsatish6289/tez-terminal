import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns the Telegram connection status and preferences for a user.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminFirestore();

    const userSnap = await db.collection("users").doc(uid).get();
    const prefsSnap = await db.collection("telegram_preferences").doc(uid).get();

    const userData = userSnap.exists ? userSnap.data() : null;
    const prefs = prefsSnap.exists ? prefsSnap.data() : null;

    const connected = !!(userData?.telegramChatId);

    return NextResponse.json({
      connected,
      enabled: userData?.telegramEnabled ?? false,
      username: userData?.telegramUsername ?? null,
      connectedAt: userData?.telegramConnectedAt ?? null,
      preferences: prefs ?? null,
    });
  } catch (error: any) {
    console.error("[Telegram Status]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
