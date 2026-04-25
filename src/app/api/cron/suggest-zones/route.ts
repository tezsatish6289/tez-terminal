/**
 * POST /api/cron/suggest-zones
 *
 * Fetches BTC options open interest from Deribit (free public API),
 * aggregates across the top 3 near-term expiries, and writes suggested
 * heatmap zone levels to config/suggested_zones in Firestore.
 *
 * Called by:
 *   - Scheduled cron (every 4–6 hours)
 *   - UI "Refresh Zones" button in HeatmapAutoSwitch sheet
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeOptionsZones } from "@/lib/options-zones";
import { deserializePrices } from "@/lib/exchanges";

export const dynamic    = "force-dynamic";
export const maxDuration = 30;

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-cron-secret");
  if (CRON_SECRET && auth && auth !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // Get current BTC price from Firestore (kept fresh by sync-prices cron)
  let btcPrice: number | null = null;
  try {
    const priceDoc = await db.doc("config/exchange_prices").get();
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

  if (!btcPrice) {
    return NextResponse.json({ error: "BTC price unavailable" }, { status: 503 });
  }

  try {
    const result = await computeOptionsZones(btcPrice);

    // Map to the 6 zone fields + metadata used by HeatmapAutoSwitch
    const suggested = {
      bullZoneLow:   result.bullZoneLow,
      bullZoneHigh:  result.bullZoneHigh,
      bullExitAbove: result.bullExitAbove,
      bearZoneLow:   result.bearZoneLow,
      bearZoneHigh:  result.bearZoneHigh,
      bearExitBelow: result.bearExitBelow,
      bullVolume:    result.bullOI,           // reuse bullVolume field for OI
      bearVolume:    result.bearOI,
      maxPain:       result.maxPain,
      expiriesUsed:  result.expiriesUsed,
      btcPrice:      result.btcPrice,
      source:        "deribit",
      computedAt:    result.computedAt,
    };

    await db.doc("config/suggested_zones").set(suggested);

    return NextResponse.json({ success: true, suggested });
  } catch (err) {
    console.error("[SuggestZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
