import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/seed-plans?key=ANTIGRAVITY_SYNC_TOKEN_2024
 * One-time endpoint to seed the config/plans doc in Firestore.
 */
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();

    await db.collection("config").doc("plans").set({
      plans: [
        { days: 30, price: 15, label: "30 days" },
        { days: 90, price: 20, label: "90 days", badge: "Most Popular" },
        { days: 365, price: 25, label: "365 days", badge: "Best Value" },
      ],
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: "Plans seeded" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
