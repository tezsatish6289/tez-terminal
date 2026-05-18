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
import { parseZones } from "@/lib/heatmap-zones-settings";

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

  // v2: `zoneHalfWidthUsd` is now auto-derived per call inside the suggester
  // and ignored from the user's settings. Only `maxPainMinDistanceUsd` is
  // still a manual override (null = use suggester default).
  let maxPainMinDistanceUsd: number | null = null;
  try {
    const hzSnap = await db.doc("config/heatmap_zones").get();
    if (hzSnap.exists) {
      const parsed = parseZones(hzSnap.data() ?? {});
      maxPainMinDistanceUsd = parsed.maxPainMinDistanceUsd;
    }
  } catch {}

  const result = await computeOptionsZones({
    asset:                 "btc",
    currentPrice:          btcPrice,
    maxPainMinDistanceUsd,
  });

  const suggested = {
    bullStrike:        result.bullStrike,
    bearStrike:        result.bearStrike,
    bullZoneLow:       result.bullZoneLow,
    bullZoneHigh:      result.bullZoneHigh,
    bullExitAbove:     result.bullExitAbove,
    bearZoneLow:       result.bearZoneLow,
    bearZoneHigh:      result.bearZoneHigh,
    bearExitBelow:     result.bearExitBelow,
    bullOI:            result.bullOI,
    bearOI:            result.bearOI,

    // Multi-day max pain picture
    maxPain:           result.maxPain,
    maxPainByExpiry:   result.maxPainByExpiry,
    signalConflict:    result.signalConflict,

    // TP targets per zone
    bullTpTarget:      result.bullTpTarget,
    bullTpExpiry:      result.bullTpExpiry,
    bullTpConfidence:  result.bullTpConfidence,
    bearTpTarget:      result.bearTpTarget,
    bearTpExpiry:      result.bearTpExpiry,
    bearTpConfidence:  result.bearTpConfidence,

    // v2 transparency fields — surfaced into config/suggested_zones so the
    // pattern-bot's loadEffectiveHeatmapZones can pull regime flags through.
    atmIV:               result.atmIV,
    ivBackwardation:     result.ivBackwardation,
    inPanicRegime:       result.inPanicRegime,
    halfWidthUsd:        result.halfWidthUsd,
    maxReachUsd:         result.maxReachUsd,
    minPinGapUsd:        result.minPinGapUsd,
    bullActionable:      result.bullActionable,
    bearActionable:      result.bearActionable,
    notActionableReason: result.notActionableReason,
    bullClusterShare:    result.bullClusterShare,
    bearClusterShare:    result.bearClusterShare,

    expiryUsed:        result.expiryUsed,
    expiriesUsed:      result.expiriesUsed,
    expiryOI:          result.expiryOI,
    insufficientGap:   result.insufficientGap,
    btcPrice:          result.btcPrice,
    deribitIndexPrice: result.deribitIndexPrice,
    source:            "deribit",
    computedAt:        result.computedAt,
  };

  await db.doc("config/suggested_zones").set(suggested);
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
    console.error("[SuggestZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST — called by the UI Refresh button (no key required, internal)
export async function POST(_request: NextRequest) {
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
