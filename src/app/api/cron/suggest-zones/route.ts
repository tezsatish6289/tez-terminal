/**
 * POST /api/cron/suggest-zones
 *
 * Runs the volume-profile analysis on the last 7 days of hourly BTC candles
 * and writes suggested heatmap zone levels to config/suggested_zones in Firestore.
 *
 * Can be called:
 *   - By a scheduled cron (every 4–6 hours)
 *   - Manually from the Heatmap sheet "Refresh" button
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeSuggestedZones } from "@/lib/volume-profile";
import { deserializePrices } from "@/lib/exchanges";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // Allow both cron-secret auth and direct user calls (no secret = UI trigger)
  const auth = request.headers.get("x-cron-secret");
  if (CRON_SECRET && auth && auth !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // Get current BTC price from Firestore (already fetched by sync-prices cron)
  let btcPrice: number | null = null;
  try {
    const priceDoc = await db.doc("config/exchange_prices").get();
    if (priceDoc.exists) {
      const allPrices = deserializePrices(
        priceDoc.data() as Record<string, Record<string, number>>,
      );
      btcPrice =
        allPrices.BYBIT.get("BTCUSDT") ??
        allPrices.BINANCE.get("BTCUSDT") ??
        null;
    }
  } catch {}

  if (!btcPrice) {
    return NextResponse.json({ error: "BTC price unavailable" }, { status: 503 });
  }

  try {
    const result = await computeSuggestedZones(btcPrice);

    // Map volume nodes to the 6 zone fields used by HeatmapAutoSwitch
    // Bull node (below price) → where longs are concentrated
    //   bullZoneLow  = node low   (entry trigger — price drops into here)
    //   bullZoneHigh = node high
    //   bullExitAbove = bearNode.high (exit bull if price reaches bear cluster)
    //
    // Bear node (above price) → where shorts are concentrated
    //   bearZoneLow  = node low
    //   bearZoneHigh = node high  (entry trigger — price rises into here)
    //   bearExitBelow = bullNode.low (exit bear if price drops to bull cluster)

    const suggested = {
      bullZoneLow:   result.bullNode?.low    ?? null,
      bullZoneHigh:  result.bullNode?.high   ?? null,
      bullExitAbove: result.bearNode?.high   ?? null,
      bearZoneLow:   result.bearNode?.low    ?? null,
      bearZoneHigh:  result.bearNode?.high   ?? null,
      bearExitBelow: result.bullNode?.low    ?? null,
      bullVolume:    result.bullNode?.volume ?? null,
      bearVolume:    result.bearNode?.volume ?? null,
      btcPrice:      result.btcPrice,
      source:        result.source,
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
