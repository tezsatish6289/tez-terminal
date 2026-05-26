/**
 * Admin verification + control endpoint for the Crypto Bot ↔ Zone Bot
 * silent attach feature.
 *
 * GET  → returns the current `attachedZoneBots` config from Firestore
 *        plus computed helper outputs (deliveredAs samples, mode
 *        resolution) so admins can confirm the plumbing is wired up
 *        correctly during rollout.
 *
 * POST → sets one or more bots' attach mode. Validates inputs through
 *        `parseAttachedZoneBots`. Writes to `config/sim_bot_crypto_settings`
 *        under the `attachedZoneBots` field; never touches other fields
 *        on that doc.
 *
 * Until PR 2 ships, flipping a bot to "sim" or "live" has NO observable
 * effect — the decision engine isn't wired yet. This endpoint exists
 * so we can validate plumbing in production before turning on behaviour.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  ATTACHED_ZONE_BOTS_DEFAULT,
  ATTACH_LOG_KEYS,
  ATTACH_MODES,
  CRYPTO_BOT_ATTACH_CONFIG_DOC,
  CRYPTO_BOT_ATTACH_FIELD,
  attachModeForBotSource,
  buildDeliveredAs,
  loadAttachedZoneBots,
  type AttachMode,
  type AttachedZoneBots,
} from "@/lib/crypto-bot-attach";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
} from "@/lib/bot-source-constants";
import { ZONE_BOT_REGISTRY } from "@/lib/zone-bot-config";

export const dynamic = "force-dynamic";

const SAMPLE_BOT_SOURCES = [
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
] as const;

function isAttachMode(v: unknown): v is AttachMode {
  return v === "off" || v === "sim" || v === "live";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const config = await loadAttachedZoneBots(db);

    const helperChecks = SAMPLE_BOT_SOURCES.map((botSource) => ({
      botSource,
      attachMode: attachModeForBotSource(config, botSource),
      deliveredAs: buildDeliveredAs(config, botSource),
    }));

    return NextResponse.json({
      ok: true,
      configDoc: CRYPTO_BOT_ATTACH_CONFIG_DOC,
      configField: CRYPTO_BOT_ATTACH_FIELD,
      attachedZoneBots: config,
      registry: ZONE_BOT_REGISTRY,
      validModes: ATTACH_MODES,
      defaults: ATTACHED_ZONE_BOTS_DEFAULT,
      logKeys: ATTACH_LOG_KEYS,
      helperChecks,
      note:
        "PR 1 plumbing only. Flipping modes to 'sim' or 'live' has no" +
        " observable effect until PR 2 ships the decision engine.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[admin/crypto-bot-attach][GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Partial<AttachedZoneBots> = {};
  const rejected: { asset: string; reason: string }[] = [];
  for (const asset of ZONE_BOT_REGISTRY) {
    if (!(asset in body)) continue;
    const raw = body[asset];
    if (!isAttachMode(raw)) {
      rejected.push({ asset, reason: `invalid mode ${JSON.stringify(raw)}` });
      continue;
    }
    update[asset] = raw;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      {
        error: "No valid mode updates provided",
        validModes: ATTACH_MODES,
        rejected,
      },
      { status: 400 },
    );
  }

  try {
    const db = getAdminFirestore();
    const docRef = db.doc(CRYPTO_BOT_ATTACH_CONFIG_DOC);

    const dottedUpdates: Record<string, unknown> = {
      attachedZoneBotsUpdatedAt: new Date().toISOString(),
    };
    for (const [asset, mode] of Object.entries(update)) {
      dottedUpdates[`${CRYPTO_BOT_ATTACH_FIELD}.${asset}`] = mode;
    }

    await docRef.set(dottedUpdates, { merge: true });

    const after = await loadAttachedZoneBots(db);
    return NextResponse.json({
      ok: true,
      applied: update,
      rejected,
      attachedZoneBots: after,
      note:
        "Plumbing-only — values are stored but have no effect until PR 2.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[admin/crypto-bot-attach][POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

