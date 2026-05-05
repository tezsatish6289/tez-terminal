/**
 * /api/cron/suggest-nifty-zones
 *
 * Fetches NIFTY options OI from NSE India, finds dominant put/call strikes
 * for the nearest liquid expiry, and writes to config/suggested_nifty_zones.
 *
 * When manualOverride === "AUTO" in nifty_zones, the sync-simulator cron
 * reads these suggested zones and uses them for auto-switch.
 *
 * Scheduled: e.g. every 15 min via cron (GET). GET skips NSE work outside Mon–Fri
 * 9:00–16:00 IST (see isNiftyOptionChainCronWindow). POST (UI refresh) always runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  buildSyntheticZonesFromSpot,
  computeNiftyOptionsZones,
  createEmptyNiftyZonesResult,
  type NiftyOptionsZones,
} from "@/lib/nifty-options-zones";
import { deserializePrices } from "@/lib/exchanges";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/** Synthetic spot bands are opt-in: set `NIFTY_SYNTHETIC_FALLBACK=true` to enable. Default is off (real NSE OI or merge prior doc only). */
function syntheticFallbackEnabled(): boolean {
  const v = process.env.NIFTY_SYNTHETIC_FALLBACK?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function run() {
  const db = getAdminFirestore();

  const prevSnap = await db.doc("config/suggested_nifty_zones").get();
  const prev = prevSnap.exists ? (prevSnap.data() as Record<string, unknown>) : null;

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

  let result: NiftyOptionsZones;
  let nseFetchError: string | null = null;
  try {
    result = await computeNiftyOptionsZones(niftyPrice);
  } catch (err) {
    nseFetchError = err instanceof Error ? err.message : String(err);
    result = createEmptyNiftyZonesResult(niftyPrice);
  }

  const spot = Math.max(niftyPrice, result.niftyPrice > 0 ? result.niftyPrice : 0);
  let source: "nse" | "synthetic_spot" = "nse";

  // Optional: synthetic bands when NSE fails but spot exists (off if NIFTY_SYNTHETIC_FALLBACK=false).
  if (
    syntheticFallbackEnabled() &&
    result.bullStrike == null &&
    result.bearStrike == null &&
    spot > 0
  ) {
    result = buildSyntheticZonesFromSpot(spot);
    source = "synthetic_spot";
    nseFetchError = null;
  }

  const zonesMissing = result.bullStrike == null && result.bearStrike == null;
  const prevHadBands =
    typeof prev?.bullZoneLow === "number" &&
    typeof prev?.bearZoneLow === "number";

  // Failed derivation (e.g. empty chain rows) must not erase last-good zones in Firestore.
  let mergedFromPrevious = false;
  let out = result;
  if (zonesMissing && prevHadBands) {
    mergedFromPrevious = true;
    out = {
      ...result,
      bullStrike:      prev!.bullStrike != null ? Number(prev.bullStrike) : result.bullStrike,
      bearStrike:      prev!.bearStrike != null ? Number(prev.bearStrike) : result.bearStrike,
      bullZoneLow:     typeof prev!.bullZoneLow === "number" ? prev.bullZoneLow as number : result.bullZoneLow,
      bullZoneHigh:    typeof prev!.bullZoneHigh === "number" ? prev.bullZoneHigh as number : result.bullZoneHigh,
      bullExitAbove:   typeof prev!.bullExitAbove === "number" ? prev.bullExitAbove as number : result.bullExitAbove,
      bearZoneLow:     typeof prev!.bearZoneLow === "number" ? prev.bearZoneLow as number : result.bearZoneLow,
      bearZoneHigh:    typeof prev!.bearZoneHigh === "number" ? prev.bearZoneHigh as number : result.bearZoneHigh,
      bearExitBelow:   typeof prev!.bearExitBelow === "number" ? prev.bearExitBelow as number : result.bearExitBelow,
      bullOI:          typeof prev!.bullOI === "number" ? prev.bullOI as number : result.bullOI,
      bearOI:          typeof prev!.bearOI === "number" ? prev.bearOI as number : result.bearOI,
      maxPain:         typeof prev!.maxPain === "number" ? prev.maxPain as number : result.maxPain,
      expiryUsed:      typeof prev!.expiryUsed === "string" ? prev.expiryUsed as string : result.expiryUsed,
      expiryOI:        typeof prev!.expiryOI === "number" ? prev.expiryOI as number : result.expiryOI,
      insufficientGap: typeof prev!.insufficientGap === "boolean" ? prev.insufficientGap as boolean : result.insufficientGap,
      niftyPrice:
        result.niftyPrice > 0
          ? result.niftyPrice
          : typeof prev!.niftyPrice === "number"
            ? prev.niftyPrice as number
            : result.niftyPrice,
    };
  }

  const suggested = {
    bullStrike:      out.bullStrike,
    bearStrike:      out.bearStrike,
    bullZoneLow:     out.bullZoneLow,
    bullZoneHigh:    out.bullZoneHigh,
    bullExitAbove:   out.bullExitAbove,
    bearZoneLow:     out.bearZoneLow,
    bearZoneHigh:    out.bearZoneHigh,
    bearExitBelow:   out.bearExitBelow,
    bullOI:          out.bullOI,
    bearOI:          out.bearOI,
    maxPain:         out.maxPain,
    expiryUsed:      out.expiryUsed,
    expiryOI:        out.expiryOI,
    insufficientGap: out.insufficientGap,
    niftyPrice:      out.niftyPrice,
    source,
    syntheticSpotFallback: source === "synthetic_spot",
    zoneNote:
      source === "synthetic_spot"
        ? "Synthetic bull/bear bands from Nifty spot only (DHAN/cache). NSE option chain blocked from this region — set NSE_HTTPS_PROXY to an Indian proxy for OI-based zones."
        : null,
    computedAt:      out.computedAt,
    mergedFromPrevious,
    nseFetchError,
  };

  // Do not replace Firestore with all-null rows when NSE failed and we have nothing new to merge.
  if (nseFetchError && zonesMissing && !mergedFromPrevious) {
    await db.doc("config/suggested_nifty_zones").set(
      {
        nseFetchError,
        computedAt: new Date().toISOString(),
        source: "nse",
        mergedFromPrevious: false,
      },
      { merge: true },
    );
    const snap = await db.doc("config/suggested_nifty_zones").get();
    return { ...(snap.data() as Record<string, unknown>), nseFetchError } as typeof suggested;
  }

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
  if (!isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "outside_nifty_zones_window",
      detail: "Skipped: Mon–Fri 9:00–16:00 IST only (cron GET). Use POST to refresh manually.",
    });
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
