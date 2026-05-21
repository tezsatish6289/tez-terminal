import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { BOT_SOURCE_BTC_ZONE, BOT_SOURCE_ETH_ZONE, BOT_SOURCE_SOL_ZONE } from "@/lib/bot-source-filter";
import {
  defaultZoneSimState,
  emptyZoneBotState,
  saveZoneSimState,
  zoneBotStateDoc,
  zoneSimStateDoc,
} from "@/lib/zone-bot-state";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_BOT_SOURCES = [
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_SOL_ZONE,
] as const;

type AllowedBotSource = (typeof ALLOWED_BOT_SOURCES)[number];

const ZONE_ASSET_BY_SOURCE: Record<AllowedBotSource, ZoneBotAsset> = {
  [BOT_SOURCE_BTC_ZONE]: "btc",
  [BOT_SOURCE_ETH_ZONE]: "eth",
  [BOT_SOURCE_SOL_ZONE]: "sol",
};

/**
 * Delete all simulator trades for one bot source and reset its zone-bot state.
 *
 * GET /api/admin/reset-simulator-bot?key=CRON_SECRET&botSource=BTC_ZONE
 *   dry=true — preview counts only
 *
 * Resets zone sim ledger (`zone_sim_state_*`) to $1000 and clears zone engine
 * state. Does not reset global `simulator_state` (Crypto Bot) or other bots' trades.
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const botSourceParam = request.nextUrl.searchParams.get("botSource");
    const dryRun = request.nextUrl.searchParams.get("dry") === "true";

    if (
      !botSourceParam ||
      !ALLOWED_BOT_SOURCES.includes(botSourceParam as AllowedBotSource)
    ) {
      return NextResponse.json(
        { error: `botSource must be one of: ${ALLOWED_BOT_SOURCES.join(", ")}` },
        { status: 400 },
      );
    }

    const botSource = botSourceParam as AllowedBotSource;
    const zoneAsset = ZONE_ASSET_BY_SOURCE[botSource];
    const db = getAdminFirestore();

    const tradesSnap = await db
      .collection("simulator_trades")
      .where("botSource", "==", botSource)
      .get();

    const tradeIds: string[] = [];
    const symbols = new Set<string>();
    let openCount = 0;

    for (const doc of tradesSnap.docs) {
      tradeIds.push(doc.id);
      const sym = doc.data().symbol as string | undefined;
      if (sym) symbols.add(sym);
      if (doc.data().status === "OPEN") openCount++;
    }

    let logsDeleted = 0;

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
        const logSnap = await db
          .collection("simulator_logs")
          .where("symbol", "==", sym)
          .get();
        for (const logDoc of logSnap.docs) {
          await db.collection("simulator_logs").doc(logDoc.id).delete();
          logsDeleted++;
        }
      }

      await db
        .collection("config")
        .doc(zoneBotStateDoc(zoneAsset))
        .set(emptyZoneBotState());
      await saveZoneSimState(db, zoneAsset, defaultZoneSimState());

      try {
        await db.collection("logs").add({
          timestamp: new Date().toISOString(),
          level: "INFO",
          message:
            `RESET_SIMULATOR_BOT [${botSource}]: deleted ${tradeIds.length} simulator_trades ` +
            `(${openCount} were OPEN), ${logsDeleted} simulator_logs; zone state cleared`,
          webhookId: "ADMIN_RESET_SIM_BOT",
        });
      } catch {
        // Non-fatal — reset already applied.
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      botSource,
      zoneAsset,
      simulatorTradesRemoved: tradeIds.length,
      openTradesRemoved: openCount,
      symbolsForLogCleanup: symbols.size,
      simulatorLogsRemoved: dryRun ? 0 : logsDeleted,
      zoneBotStateReset: dryRun ? "skipped (dry run)" : zoneBotStateDoc(zoneAsset),
      zoneSimStateReset: dryRun ? "skipped (dry run)" : zoneSimStateDoc(zoneAsset),
      counterfactualStartingCapitalUsd: 1000,
      note:
        "Each zone bot uses its own $1000 sim ledger. Crypto Bot shared simulator_state is unchanged.",
    });
  } catch (err) {
    console.error("[reset-simulator-bot]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
