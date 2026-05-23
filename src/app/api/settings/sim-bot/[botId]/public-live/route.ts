import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  parseSimBotSettings,
  simBotSettingsToPartialUpdate,
  SIM_BOT_SETTINGS_DOC,
} from "@/lib/sim-bot-settings";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { SIM_COCKPIT_BOTS } from "@/lib/sim-cockpit-bots";
import {
  publicLivePassphraseConfigured,
  verifyPublicLivePassphrase,
} from "@/lib/public-live-gate";

export const dynamic = "force-dynamic";

const VALID_IDS = new Set(SIM_COCKPIT_BOTS.map((b) => b.id));

function parseBotId(raw: string): CockpitBotId | null {
  return VALID_IDS.has(raw as CockpitBotId) ? (raw as CockpitBotId) : null;
}

/**
 * POST /api/settings/sim-bot/[botId]/public-live
 * Body: { publicLive: boolean, passphrase: string }
 * Auth: Firebase admin + PUBLIC_LIVE_PASSPHRASE
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!publicLivePassphraseConfigured()) {
    return NextResponse.json(
      { error: "PUBLIC_LIVE_PASSPHRASE is not configured on the server" },
      { status: 503 },
    );
  }

  const { botId: raw } = await params;
  const botId = parseBotId(raw);
  if (!botId) {
    return NextResponse.json({ error: "Invalid bot id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    publicLive?: boolean;
    passphrase?: string;
  };

  if (typeof body.publicLive !== "boolean") {
    return NextResponse.json({ error: "publicLive must be a boolean" }, { status: 400 });
  }

  const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
  if (!verifyPublicLivePassphrase(passphrase)) {
    return NextResponse.json({ error: "Invalid passphrase" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const docPath = SIM_BOT_SETTINGS_DOC[botId];
  const snap = await db.doc(docPath).get();
  const current = parseSimBotSettings(
    botId,
    snap.exists ? (snap.data() as Record<string, unknown>) : null,
  );

  const update = simBotSettingsToPartialUpdate(botId, {
    ...current,
    publicLive: body.publicLive,
  });
  await db.doc(docPath).set(update, { merge: true });

  const merged = parseSimBotSettings(botId, { ...current, ...update });
  return NextResponse.json(merged);
}
