/**
 * /api/cron/suggest-nifty-zones
 *
 * Fetches NIFTY options OI from NSE India, finds dominant put/call strikes
 * for the nearest liquid expiry, and writes to config/suggested_nifty_zones.
 *
 * When manualOverride === "AUTO" in nifty_zones, the sync-simulator cron
 * reads these suggested zones and uses them for auto-switch.
 *
 * Scheduled: every 1–4 hours via cron-job.org (GET).
 * Also callable manually from the UI Refresh button (POST).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeNiftyOptionsZones } from "@/lib/nifty-options-zones";
import { deserializePrices } from "@/lib/exchanges";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

async function run() {
  const db = getAdminFirestore();

  // Get current Nifty price from Firestore (kept fresh by sync-prices cron).
  // If unavailable, pass 0 — computeNiftyOptionsZones will fall back to
  // records.underlyingValue embedded in the NSE option chain response.
  let niftyPrice = 0;
  try {
    const priceDoc = await db.doc("config/exchange_prices").get();
    if (priceDoc.exists) {
      const allPrices = deserializePrices(
        priceDoc.data() as Record<string, Record<string, number>>,
      );
      niftyPrice = allPrices.DHAN?.get("NIFTY50") ?? 0;
    }
  } catch {}

  const result = await computeNiftyOptionsZones(niftyPrice);

  const suggested = {
    bullStrike:      result.bullStrike,
    bearStrike:      result.bearStrike,
    bullZoneLow:     result.bullZoneLow,
    bullZoneHigh:    result.bullZoneHigh,
    bullExitAbove:   result.bullExitAbove,
    bearZoneLow:     result.bearZoneLow,
    bearZoneHigh:    result.bearZoneHigh,
    bearExitBelow:   result.bearExitBelow,
    bullOI:          result.bullOI,
    bearOI:          result.bearOI,
    maxPain:         result.maxPain,
    expiryUsed:      result.expiryUsed,
    expiryOI:        result.expiryOI,
    insufficientGap: result.insufficientGap,
    niftyPrice:      result.niftyPrice,
    source:          "nse",
    computedAt:      result.computedAt,
  };

  await db.doc("config/suggested_nifty_zones").set(suggested);
  return suggested;
}

// GET — called by cron-job.org with ?key=CRON_SECRET
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const suggested = await run();
    return NextResponse.json({ success: true, suggested });
  } catch (err) {
    console.error("[SuggestNiftyZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST — called by the UI Refresh button
export async function POST(_request: NextRequest) {
  try {
    const suggested = await run();
    return NextResponse.json({ success: true, suggested });
  } catch (err) {
    console.error("[SuggestNiftyZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
