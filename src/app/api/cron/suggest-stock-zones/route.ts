/**
 * /api/cron/suggest-stock-zones
 *
 * Sole cron for NSE F&O single-stock option zones (no piggyback on suggest-zones).
 *
 * Schedule (recommended): every 5 min on cron-job.org with key, 24/7:
 *   GET https://…/api/cron/suggest-stock-zones?key=CRON_SECRET
 * Set cron-job.org request timeout ≥ 180s (platform limit 120s per HTTP request).
 *
 * Queue: static FNO_UNIVERSE + Firestore cursor + aggregate entries.
 *   • backlog — symbols not yet in aggregate (Tier B order)
 *   • refresh — all scanned → oldest computedAt first
 * Fetch: NSE per symbol; Dhan fallback on block/circuit (or DHAN_PRIMARY env).
 *
 * Response: queueMode, backlogRemaining, nseOk, dhanOk, nseSession, ok, …
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { runStockZonesBatch } from "@/lib/stock-zones-runner";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
/** Must match apphosting.yaml runConfig.timeoutSeconds (120). */
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // cron-job.org runs 24/7; a keyed call is trusted — do not no-op after 4pm IST.
  const keyedCron = Boolean(CRON_SECRET && key === CRON_SECRET);
  if (!keyedCron && !isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: "outside_market_hours",
      processed: 0,
      ok: 0,
      hint: "Add ?key=CRON_SECRET so scheduled crons scan stocks outside 9–16 IST.",
    });
  }
  try {
    const summary = await runStockZonesBatch(getAdminFirestore());
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let symbolsOverride: string[] | undefined;
    try {
      const body = (await request.json()) as { symbols?: string[] };
      if (Array.isArray(body?.symbols)) {
        symbolsOverride = body.symbols.map((s) => String(s).toUpperCase());
      }
    } catch {
      /* no body — full queue batch */
    }
    const summary = await runStockZonesBatch(getAdminFirestore(), { symbolsOverride });
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Manual failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
