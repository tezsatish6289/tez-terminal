import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { createInitialState, getSimStateDocId } from "@/lib/simulator";

export const dynamic = "force-dynamic";

const ALLOWED_ASSETS = ["INDIAN_STOCKS", "COMMODITIES"] as const;

/**
 * DELETE paper-trading history for one asset type and reset simulator state to defaults.
 *
 * GET /api/admin/reset-simulator-asset?key=CRON_SECRET&asset=INDIAN_STOCKS
 *   dry=true              — preview counts only
 *   includeLiveTrades=true — also delete Firestore `live_trades` where exchange is DHAN (Indian stocks only).
 *                            Does not close positions on the broker.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assetParam = request.nextUrl.searchParams.get("asset");
  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const includeLiveTrades = request.nextUrl.searchParams.get("includeLiveTrades") === "true";

  if (!assetParam || !ALLOWED_ASSETS.includes(assetParam as (typeof ALLOWED_ASSETS)[number])) {
    return NextResponse.json(
      { error: `asset must be one of: ${ALLOWED_ASSETS.join(", ")}` },
      { status: 400 },
    );
  }

  const asset = assetParam as (typeof ALLOWED_ASSETS)[number];
  const db = getAdminFirestore();

  const tradesSnap = await db.collection("simulator_trades").where("assetType", "==", asset).get();

  const tradeIds: string[] = [];
  const symbols = new Set<string>();

  for (const doc of tradesSnap.docs) {
    tradeIds.push(doc.id);
    const sym = doc.data().symbol as string | undefined;
    if (sym) symbols.add(sym);
  }

  let liveIdsToDelete: string[] = [];
  if (includeLiveTrades && asset === "INDIAN_STOCKS") {
    const liveSnap = await db.collection("live_trades").where("exchange", "==", "DHAN").get();
    liveIdsToDelete = liveSnap.docs.map((d) => d.id);
  }

  let logsDeleted = 0;
  let liveDeleted = 0;

  if (!dryRun) {
    const chunkSize = 400;

    for (let i = 0; i < tradeIds.length; i += chunkSize) {
      const batch = db.batch();
      for (const id of tradeIds.slice(i, i + chunkSize)) {
        batch.delete(db.collection("simulator_trades").doc(id));
      }
      await batch.commit();
    }

    for (const sym of symbols) {
      const logSnap = await db.collection("simulator_logs").where("symbol", "==", sym).get();
      for (const logDoc of logSnap.docs) {
        await db.collection("simulator_logs").doc(logDoc.id).delete();
        logsDeleted++;
      }
    }

    if (includeLiveTrades && asset === "INDIAN_STOCKS") {
      for (let i = 0; i < liveIdsToDelete.length; i += chunkSize) {
        const batch = db.batch();
        for (const id of liveIdsToDelete.slice(i, i + chunkSize)) {
          batch.delete(db.collection("live_trades").doc(id));
        }
        await batch.commit();
      }
      liveDeleted = liveIdsToDelete.length;
    }

    const fresh = createInitialState(asset);
    await db.collection("config").doc(getSimStateDocId(asset)).set(fresh);

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `RESET_SIMULATOR [${asset}]: deleted ${tradeIds.length} simulator_trades, ${logsDeleted} simulator_logs${
        includeLiveTrades && asset === "INDIAN_STOCKS" ? `, ${liveDeleted} live_trades (DHAN)` : ""
      }; state reset (startingCapital=${fresh.startingCapital})`,
      webhookId: "ADMIN_RESET_SIM",
    });
  }

  const freshPreview = createInitialState(asset);

  return NextResponse.json({
    success: true,
    dryRun,
    asset,
    includeLiveTrades,
    simulatorTradesRemoved: tradeIds.length,
    symbolsForLogCleanup: symbols.size,
    simulatorLogsRemoved: dryRun ? 0 : logsDeleted,
    liveTradesRemoved:
      asset !== "INDIAN_STOCKS"
        ? "n/a"
        : includeLiveTrades
          ? dryRun
            ? liveIdsToDelete.length
            : liveDeleted
          : "skipped (pass includeLiveTrades=true)",
    newStartingCapital: freshPreview.startingCapital,
    newCapital: freshPreview.capital,
    warning:
      includeLiveTrades && asset === "INDIAN_STOCKS"
        ? "live_trades deleted in Firestore only — close any real DHAN positions on the broker if needed."
        : undefined,
  });
}
