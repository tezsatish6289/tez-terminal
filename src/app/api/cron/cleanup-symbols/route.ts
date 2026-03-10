import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * One-time cleanup: delete all crypto signals whose symbol does not end with USDT.P.
 * Also cleans up related signal_events and tracked_signals.
 *
 * GET /api/cron/cleanup-symbols?key=<CRON_SECRET>&dryrun=true  (preview)
 * GET /api/cron/cleanup-symbols?key=<CRON_SECRET>              (delete)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryrun = searchParams.get("dryrun") === "true";
  const db = getAdminFirestore();

  try {
    const signalsSnap = await db.collection("signals").get();
    const toDelete: { id: string; symbol: string }[] = [];

    for (const doc of signalsSnap.docs) {
      const data = doc.data();
      const assetType = String(data.assetType || data.asset_type || "").toUpperCase();
      if (!assetType.includes("CRYPTO")) continue;

      const symbol = String(data.symbol || "").toUpperCase();
      if (!symbol.endsWith("USDT.P")) {
        toDelete.push({ id: doc.id, symbol });
      }
    }

    if (dryrun) {
      return NextResponse.json({
        success: true,
        dryrun: true,
        count: toDelete.length,
        signals: toDelete,
      });
    }

    const signalIds = new Set(toDelete.map((s) => s.id));
    let eventsDeleted = 0;
    let trackedDeleted = 0;

    // Delete related signal_events
    for (const id of signalIds) {
      const eventsSnap = await db.collection("signal_events")
        .where("signalId", "==", id)
        .get();
      for (const eventDoc of eventsSnap.docs) {
        await eventDoc.ref.delete();
        eventsDeleted++;
      }

      const trackedSnap = await db.collection("tracked_signals")
        .where("signalId", "==", id)
        .get();
      for (const trackedDoc of trackedSnap.docs) {
        await trackedDoc.ref.delete();
        trackedDeleted++;
      }
    }

    // Delete the signals themselves
    for (const { id } of toDelete) {
      await db.collection("signals").doc(id).delete();
    }

    const symbols = [...new Set(toDelete.map((s) => s.symbol))];

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `CLEANUP: deleted ${toDelete.length} non-USDT.P signals, ${eventsDeleted} events, ${trackedDeleted} tracked`,
      details: `symbols: ${symbols.join(", ")}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      deleted: toDelete.length,
      eventsDeleted,
      trackedDeleted,
      symbols,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
