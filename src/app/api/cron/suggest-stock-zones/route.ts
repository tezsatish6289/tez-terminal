/**
 * /api/cron/suggest-stock-zones
 *
 * Dedicated cron for NSE single-stock option zones. Also runs automatically as a
 * piggyback on `/api/cron/suggest-zones` during market hours (same schedule as indices).
 *
 * Schedule (optional extra throughput):
 *   GET https://…/api/cron/suggest-stock-zones?key=CRON_SECRET  (every 5–15 min, NSE hours)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { runStockZonesBatch } from "@/lib/stock-zones-runner";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNiftyOptionChainCronWindow()) {
    return NextResponse.json({ success: true, skipped: "outside_market_hours" });
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
