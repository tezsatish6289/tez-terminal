import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns the last N hours of chop filter history for the oscillator chart.
 * Query param: ?hours=24 (default 24, max 72)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hours = Math.min(parseInt(searchParams.get("hours") || "24", 10) || 24, 72);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const db = getAdminFirestore();

  const snap = await db
    .collection("chop_filter_history")
    .where("timestamp", ">=", cutoff)
    .orderBy("timestamp", "asc")
    .limit(1500)
    .get();

  const points = snap.docs.map((d) => {
    const data = d.data();
    const entry: Record<string, any> = { timestamp: data.timestamp };
    for (const tf of ["5", "15", "60", "240", "D"]) {
      if (data[tf]) {
        entry[tf] = {
          ratio: data[tf].ratio,
          bullishKills: data[tf].bullishKills,
          bearishKills: data[tf].bearishKills,
          totalEvents: data[tf].totalEvents,
          isChoppy: data[tf].isChoppy,
        };
      }
    }
    return entry;
  });

  return NextResponse.json({ points, count: points.length, hours });
}
