import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { ZONE_BOT_REGISTRY } from "@/lib/zone-bot-config";
import {
  defaultZoneSimState,
  saveZoneSimState,
  zoneSimStateDoc,
} from "@/lib/zone-bot-state";

export const dynamic = "force-dynamic";

/**
 * Seed each zone bot's sim ledger at $1000 (btc, eth, sol).
 * Does not delete trades — use reset-simulator-bot per botSource for that.
 *
 * GET /api/admin/init-zone-sim-states?key=CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const dryRun = request.nextUrl.searchParams.get("dry") === "true";

  if (!dryRun) {
    for (const asset of ZONE_BOT_REGISTRY) {
      await saveZoneSimState(db, asset, defaultZoneSimState());
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    assets: [...ZONE_BOT_REGISTRY],
    startingCapitalUsd: 1000,
    docs: ZONE_BOT_REGISTRY.map((a) => zoneSimStateDoc(a)),
  });
}
