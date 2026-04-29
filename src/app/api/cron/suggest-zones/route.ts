/**
 * /api/cron/suggest-zones
 *
 * Fetches BTC options OI from Deribit, finds dominant put/call strikes
 * for the nearest liquid expiry, and writes to config/suggested_zones.
 *
 * When manualOverride === "AUTO" in heatmap_zones, the sync-simulator
 * cron reads these suggested zones directly and uses them for auto-switch.
 *
 * Scheduled: every 4 hours via vercel.json (GET).
 * Also callable manually from the UI Refresh button (POST).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeOptionsZones } from "@/lib/options-zones";
import { deserializePrices } from "@/lib/exchanges";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const CRON_SECRET = process.env.CRON_SECRET;

async function run() {
  const db = getAdminFirestore();

  // Get current BTC price from Firestore (kept fresh by sync-prices cron)
  let btcPrice: number | null = null;
  try {
    const priceDoc  = await db.doc("config/exchange_prices").get();
    if (priceDoc.exists) {
      const allPrices = deserializePrices(
        priceDoc.data() as Record<string, Record<string, number>>,
      );
      btcPrice =
        allPrices.BYBIT?.get("BTCUSDT") ??
        allPrices.BINANCE?.get("BTCUSDT") ??
        null;
    }
  } catch {}

  if (!btcPrice) throw new Error("BTC price unavailable");

  const result = await computeOptionsZones(btcPrice);

  const suggested = {
    bullZoneLow:     result.bullZoneLow,
    bullZoneHigh:    result.bullZoneHigh,
    bullExitAbove:   result.bullExitAbove,   // = maxPain
    bearZoneLow:     result.bearZoneLow,
    bearZoneHigh:    result.bearZoneHigh,
    bearExitBelow:   result.bearExitBelow,   // = maxPain
    bullOI:          result.bullOI,
    bearOI:          result.bearOI,
    maxPain:         result.maxPain,
    expiryUsed:      result.expiryUsed,
    expiryOI:        result.expiryOI,
    insufficientGap: result.insufficientGap,
    btcPrice:        result.btcPrice,
    source:          "deribit",
    computedAt:      result.computedAt,
  };

  await db.doc("config/suggested_zones").set(suggested);
  return suggested;
}

// GET — called by Vercel cron (no secret required, cron is internal)
export async function GET(request: NextRequest) {
  const auth = request.headers.get("x-cron-secret");
  if (CRON_SECRET && auth && auth !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const suggested = await run();
    return NextResponse.json({ success: true, suggested });
  } catch (err) {
    console.error("[SuggestZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST — called by the UI Refresh button
export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-cron-secret");
  if (CRON_SECRET && auth && auth !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const suggested = await run();
    return NextResponse.json({ success: true, suggested });
  } catch (err) {
    console.error("[SuggestZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
