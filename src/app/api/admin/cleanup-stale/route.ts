import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const db = getAdminFirestore();

  const staleSnap = await db
    .collection("signals")
    .where("autoFilterPassed", "==", false)
    .where("confidenceLabel", "==", "Stale")
    .get();

  if (staleSnap.empty) {
    return NextResponse.json({ message: "No stale signals found", deleted: 0 });
  }

  const staleIds = staleSnap.docs.map((d) => d.id);
  const staleDetails = staleSnap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      symbol: s.symbol,
      type: s.type,
      timeframe: s.timeframe,
      receivedAt: s.receivedAt,
      status: s.status,
    };
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: staleIds.length,
      signals: staleDetails,
    });
  }

  let deletedSignals = 0;
  let deletedEvents = 0;

  for (const id of staleIds) {
    const eventsSnap = await db
      .collection("signal_events")
      .where("signalId", "==", id)
      .get();

    for (const eventDoc of eventsSnap.docs) {
      await eventDoc.ref.delete();
      deletedEvents++;
    }

    await db.collection("signals").doc(id).delete();
    deletedSignals++;
  }

  await db.collection("logs").add({
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: `CLEANUP: Deleted ${deletedSignals} stale signals and ${deletedEvents} related events`,
    webhookId: "ADMIN_CLEANUP",
  });

  return NextResponse.json({
    success: true,
    deletedSignals,
    deletedEvents,
    details: staleDetails,
  });
}
