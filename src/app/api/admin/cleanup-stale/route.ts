import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") || "cleanup";
  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const db = getAdminFirestore();

  // Diagnostic mode: show all active signals and their AI filter status
  if (mode === "diagnose") {
    const allActive = await db
      .collection("signals")
      .where("status", "==", "ACTIVE")
      .get();

    const breakdown = { passed: 0, failed: 0, unscored: 0, total: 0 };
    const signals = allActive.docs.map((d) => {
      const s = d.data();
      const state =
        s.autoFilterPassed === true
          ? "passed"
          : s.autoFilterPassed === false
            ? "failed"
            : "unscored";
      breakdown[state]++;
      breakdown.total++;
      return {
        id: d.id,
        symbol: s.symbol,
        type: s.type,
        timeframe: s.timeframe,
        receivedAt: s.receivedAt,
        autoFilterPassed: s.autoFilterPassed ?? null,
        confidenceScore: s.confidenceScore ?? null,
        confidenceLabel: s.confidenceLabel ?? null,
        tp1Hit: s.tp1Hit ?? false,
        tp2Hit: s.tp2Hit ?? false,
        tp3Hit: s.tp3Hit ?? false,
        slHitAt: s.slHitAt ?? null,
        state,
      };
    });

    return NextResponse.json({ breakdown, signals });
  }

  // Cleanup mode: delete non-AI-passed signals (failed + unscored)
  const allSnap = await db
    .collection("signals")
    .where("status", "==", "ACTIVE")
    .where("autoFilterPassed", "==", false)
    .get();

  if (allSnap.empty) {
    return NextResponse.json({
      message: "No signals to clean up",
      deleted: 0,
      debug: { queryReturned: allSnap.size },
    });
  }

  const toDelete = allSnap.docs;

  const staleIds = toDelete.map((d) => d.id);
  const staleDetails = toDelete.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      symbol: s.symbol,
      type: s.type,
      timeframe: s.timeframe,
      receivedAt: s.receivedAt,
      status: s.status,
      autoFilterPassed: s.autoFilterPassed ?? null,
      confidenceLabel: s.confidenceLabel ?? null,
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
