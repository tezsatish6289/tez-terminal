/**
 * /api/cron/sr-audit-outcomes
 *
 * Hourly: score open SR zone events using Dhan klines until invalidation or zone flip.
 * Schedule on cron-job.org (e.g. every hour during market hours).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { scoreOpenSrZoneEvents } from "@/lib/sr-audit/score-events";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyedCron = Boolean(CRON_SECRET && key === CRON_SECRET);
  const force = searchParams.get("force") === "1";
  if (!keyedCron && !force && !isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: "outside_market_hours",
      hint: "Add ?key=CRON_SECRET for scheduled runs outside 9–16 IST.",
    });
  }

  try {
    const summary = await scoreOpenSrZoneEvents(getAdminFirestore());
    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sr-audit-outcomes]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
