import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  parseSimBotSettings,
  simBotSettingsToPartialUpdate,
  SIM_BOT_SETTINGS_DOC,
  type SimBotSettings,
} from "@/lib/sim-bot-settings";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { SIM_COCKPIT_BOTS } from "@/lib/sim-cockpit-bots";

export const dynamic = "force-dynamic";

const VALID_IDS = new Set(SIM_COCKPIT_BOTS.map((b) => b.id));

function parseBotId(raw: string): CockpitBotId | null {
  return VALID_IDS.has(raw as CockpitBotId) ? (raw as CockpitBotId) : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { botId: raw } = await params;
  const botId = parseBotId(raw);
  if (!botId) {
    return NextResponse.json({ error: "Invalid bot id" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.doc(SIM_BOT_SETTINGS_DOC[botId]).get();
  if (snap.exists) {
    return NextResponse.json(
      parseSimBotSettings(botId, snap.data() as Record<string, unknown>),
    );
  }

  const { loadSimBotSettings } = await import("@/lib/sim-bot-settings");
  const settings = await loadSimBotSettings(db, botId);
  return NextResponse.json(settings);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { botId: raw } = await params;
  const botId = parseBotId(raw);
  if (!botId) {
    return NextResponse.json({ error: "Invalid bot id" }, { status: 400 });
  }

  const body = (await request.json()) as Partial<SimBotSettings>;
  const db = getAdminFirestore();
  const docPath = SIM_BOT_SETTINGS_DOC[botId];
  const snap = await db.doc(docPath).get();
  const current = parseSimBotSettings(
    botId,
    snap.exists ? (snap.data() as Record<string, unknown>) : null,
  );
  const update = simBotSettingsToPartialUpdate(botId, { ...current, ...body });
  await db.doc(docPath).set(update, { merge: true });

  // Keep legacy BTC heatmap_zones in sync for macro gate until fully migrated.
  if (botId === "btc" || botId === "crypto") {
    const zoneFields: Record<string, unknown> = {};
    if ("manualOverride" in body) zoneFields.manualOverride = update.manualOverride;
    if ("zoneConfirmMinutes" in body) {
      zoneFields.zoneConfirmMinutes = update.zoneConfirmMinutes;
    }
    if (Object.keys(zoneFields).length > 0) {
      await db.doc("config/heatmap_zones").set(zoneFields, { merge: true });
    }
  }
  if (botId === "btc" || botId === "eth" || botId === "sol") {
    const zUpdate: Record<string, unknown> = { updatedAt: update.updatedAt };
    if ("manualOverride" in body) zUpdate.manualOverride = update.manualOverride;
    if ("zoneConfirmMinutes" in body) {
      zUpdate.zoneConfirmMinutes = update.zoneConfirmMinutes;
    }
    if ("maxPainMinDistanceUsd" in body) {
      zUpdate.maxPainMinDistanceUsd = update.maxPainMinDistanceUsd;
    }
    if ("maxPainProximityUsd" in body) {
      zUpdate.maxPainProximityUsd = update.maxPainProximityUsd;
    }
    if (Object.keys(zUpdate).length > 1) {
      const legacy =
        botId === "btc"
          ? "config/heatmap_zones"
          : `config/zone_bot_${botId}_settings`;
      await db.doc(legacy).set(zUpdate, { merge: true });
    }
  }

  const merged = parseSimBotSettings(botId, { ...current, ...update });
  return NextResponse.json(merged);
}
