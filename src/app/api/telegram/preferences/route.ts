import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";

export const dynamic = "force-dynamic";

/**
 * Updates Telegram alert preferences from the web app.
 * Handles both full updates and partial (symbol watchlist) updates.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firebaseUid, preferences } = body;

    if (!firebaseUid || !preferences) {
      return NextResponse.json({ error: "Missing firebaseUid or preferences" }, { status: 400 });
    }

    const { firestore } = initializeFirebase();

    const validFields = ["enabled", "alertTypes", "timeframes", "assetTypes", "sides", "symbols"];
    const cleanPrefs: Record<string, any> = {};
    for (const key of validFields) {
      if (preferences[key] !== undefined) {
        cleanPrefs[key] = preferences[key];
      }
    }

    await setDoc(doc(firestore, "telegram_preferences", firebaseUid), cleanPrefs, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Telegram Preferences]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
