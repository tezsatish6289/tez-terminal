import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  botSourceForCockpit,
  isManualSimTrade,
  zoneAssetFromBotId,
} from "@/lib/manual-sim-open";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { SIM_COCKPIT_BOTS } from "@/lib/sim-cockpit-bots";
import { BOT_SOURCE_PATTERN } from "@/lib/bot-source-filter";
import { loadZoneBotState, saveZoneBotState, zoneBotStateDoc } from "@/lib/zone-bot-state";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import type { SimTrade } from "@/lib/simulator";

export const dynamic = "force-dynamic";

const VALID_BOT_IDS = new Set<CockpitBotId>(SIM_COCKPIT_BOTS.map((b) => b.id));

type MigrateBody = { simTradeId?: string; targetBotId?: string };

const ZONE_ASSETS: ZoneBotAsset[] = ["btc", "eth", "sol", "xrp"];

async function runMigrate(simTradeId: string, targetBotId: CockpitBotId) {
  const db = getAdminFirestore();
  const ref = db.collection("simulator_trades").doc(simTradeId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Trade not found");
  }

  const trade = snap.data() as SimTrade;
  if (trade.status !== "OPEN") {
    throw new Error("Only OPEN trades can be migrated");
  }
  if (!isManualSimTrade(trade)) {
    throw new Error("Only manual cockpit trades can be migrated");
  }

  const previousBotSource = trade.botSource ?? BOT_SOURCE_PATTERN;
  const newBotSource = botSourceForCockpit(targetBotId);
  if (previousBotSource === newBotSource) {
    return {
      success: true,
      simTradeId,
      message: "Already on target bot",
      botSource: newBotSource,
      symbol: trade.symbol,
      targetBotId,
    };
  }

  const zoneCleared: string[] = [];
  for (const asset of ZONE_ASSETS) {
    const state = await loadZoneBotState(db, asset);
    if (state.openTradeId === simTradeId) {
      await saveZoneBotState(db, asset, {
        ...state,
        openTradeId: null,
        reason: `Manual trade migrated to ${targetBotId} bot`,
        updatedAt: new Date().toISOString(),
      });
      zoneCleared.push(zoneBotStateDoc(asset));
    }
  }

  await ref.update({
    botSource: newBotSource,
    biasAtEntry:
      targetBotId === "crypto"
        ? trade.biasAtEntry?.replace(/^Zone:/, "Manual:") ?? "Manual"
        : trade.biasAtEntry,
  });

  const liveSnap = await db
    .collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .get();
  const liveBatch = db.batch();
  for (const doc of liveSnap.docs) {
    liveBatch.update(doc.ref, { botSource: newBotSource });
  }
  if (!liveSnap.empty) await liveBatch.commit();

  const targetZone = zoneAssetFromBotId(targetBotId);
  if (targetZone) {
    const state = await loadZoneBotState(db, targetZone);
    await saveZoneBotState(db, targetZone, {
      ...state,
      openTradeId: simTradeId,
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    success: true,
    simTradeId,
    symbol: trade.symbol,
    previousBotSource,
    botSource: newBotSource,
    targetBotId,
    zoneStateCleared: zoneCleared,
    liveTradesUpdated: liveSnap.size,
    note:
      "Doc id unchanged; cockpit filters on botSource. Crypto Bot = PATTERN.",
  };
}

/**
 * POST /api/admin/manual-trade/migrate-bot — admin bearer token
 * GET  ?key=CRON_SECRET&simTradeId=…&targetBotId=crypto — ops / pre-deploy
 *
 * Re-stamps botSource (and clears the wrong zone bot's openTradeId) so a
 * mistaken manual punch shows under the intended cockpit bot.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: MigrateBody;
  try {
    body = (await request.json()) as MigrateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const simTradeId = body.simTradeId?.trim();
  const targetBotId = body.targetBotId as CockpitBotId | undefined;
  if (!simTradeId) {
    return NextResponse.json({ error: "simTradeId required" }, { status: 400 });
  }
  if (!targetBotId || !VALID_BOT_IDS.has(targetBotId)) {
    return NextResponse.json(
      { error: `targetBotId must be one of: ${[...VALID_BOT_IDS].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await runMigrate(simTradeId, targetBotId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Trade not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simTradeId = request.nextUrl.searchParams.get("simTradeId")?.trim();
  const targetBotId = request.nextUrl.searchParams.get("targetBotId") as CockpitBotId | null;
  if (!simTradeId) {
    return NextResponse.json({ error: "simTradeId required" }, { status: 400 });
  }
  if (!targetBotId || !VALID_BOT_IDS.has(targetBotId)) {
    return NextResponse.json(
      { error: `targetBotId must be one of: ${[...VALID_BOT_IDS].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await runMigrate(simTradeId, targetBotId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Trade not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
