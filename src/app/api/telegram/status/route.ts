import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

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

    const { firestore } = initializeFirebase();

    const userDoc = await getDoc(doc(firestore, "users", uid));
    const prefsDoc = await getDoc(doc(firestore, "telegram_preferences", uid));

    const userData = userDoc.exists() ? userDoc.data() : null;
    const prefs = prefsDoc.exists() ? prefsDoc.data() : null;

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
