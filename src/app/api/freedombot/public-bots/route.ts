import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import { loadPublicBotFlags } from "@/lib/public-bot-flags";

export const dynamic = "force-dynamic";

/**
 * GET /api/freedombot/public-bots
 * Which bots are visible on freedombot.ai (performance, records, deploy).
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const flags = await loadPublicBotFlags(db);

    const bots = CRYPTO_BOTS.map((b) => ({
      id: b.id,
      label: b.label,
      shortLabel: b.shortLabel,
      deployKey: b.deployKey,
      botSource: b.botSource,
      icon: b.icon,
      logo: b.logo,
      publicLive: flags[b.id],
    }));

    return NextResponse.json({
      bots,
      /** First public bot — sensible default tab on performance/records. */
      defaultBotId: bots.find((b) => b.publicLive)?.id ?? "crypto",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[public-bots]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
