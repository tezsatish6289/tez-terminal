/**
 * /api/cron/suggest-index-zones
 *
 * Fetches NSE option-chain OI for all five indices on
 * https://www.nseindia.com/option-chain — NIFTY, BANKNIFTY, FINNIFTY,
 * MIDCPNIFTY, NIFTYNXT50 — derives dominant put/call zones + max pain, and
 * writes one doc per index:
 *
 *   • config/suggested_index_zones_{SYMBOL}
 *
 * Powers the public freedombot.ai/levels "NSE Indices" tab. Serialized in the
 * same field shape as the crypto `suggested_zones_*` docs so the levels page
 * can render both with the shared ZonePriceLadder.
 *
 * The legacy single-symbol NIFTY path (`/api/cron/suggest-nifty-zones` →
 * config/suggested_nifty_zones) is left intact for the admin auto-switch.
 *
 * Scheduled every ~15 min via cron (GET, gated to Mon–Fri 9:00–16:00 IST).
 * POST (UI refresh) always runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  INDEX_KEYS,
  INDEX_SPECS,
  computeIndexZones,
  getNseCookies,
  type IndexKey,
  type IndexOptionsZones,
} from "@/lib/index-options-zones";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const CRON_SECRET = process.env.CRON_SECRET;

function docId(symbol: IndexKey): string {
  return `config/suggested_index_zones_${symbol}`;
}

/**
 * Serialize into the shared "suggested zones" snapshot shape consumed by the
 * levels page + ZonePriceLadder. `btcPrice` carries the index spot (the ladder
 * reads `deribitIndexPrice ?? btcPrice` for the current-price line); the
 * invalidation lines are derived on the client (one half-width outside each
 * band, same as crypto).
 */
function serialize(z: IndexOptionsZones) {
  const maxPainByExpiry =
    z.maxPain != null && z.expiryUsed
      ? [{ expiry: z.expiryUsed, maxPain: z.maxPain, totalOI: z.expiryOI ?? 0, dayIndex: 0 }]
      : [];
  return {
    symbol: z.symbol,
    label: z.label,
    bullStrike: z.bullStrike,
    bearStrike: z.bearStrike,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bullExitAbove: z.bullExitAbove,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    bearExitBelow: z.bearExitBelow,
    bullOI: z.bullOI,
    bearOI: z.bearOI,
    maxPain: z.maxPain,
    maxPainByExpiry,
    halfWidthUsd: z.halfWidthPts,
    expiryUsed: z.expiryUsed,
    expiryOI: z.expiryOI,
    insufficientGap: z.insufficientGap,
    btcPrice: z.spot,
    deribitIndexPrice: null,
    source: "nse",
    nseFetchError: null,
    computedAt: z.computedAt,
  };
}

async function run() {
  const db = getAdminFirestore();

  // One cookie jar reused across all five indices.
  let cookies = "";
  let cookieError: string | null = null;
  try {
    cookies = await getNseCookies();
  } catch (e) {
    cookieError = e instanceof Error ? e.message : String(e);
  }

  const results: Record<string, "ok" | "error"> = {};
  const errors: Record<string, string> = {};

  for (const key of INDEX_KEYS) {
    if (cookieError) {
      results[key] = "error";
      errors[key] = `NSE session bootstrap failed: ${cookieError}`;
      continue;
    }
    try {
      const zones = await computeIndexZones(key, cookies);
      const hasBands = zones.bullZoneLow != null || zones.bearZoneLow != null;
      if (!hasBands) {
        // Don't overwrite last-good bands with an empty result.
        results[key] = "error";
        errors[key] = "No bull/bear bands derived (empty/illiquid chain)";
        await db.doc(docId(key)).set(
          { nseFetchError: errors[key], computedAt: zones.computedAt },
          { merge: true },
        );
        continue;
      }
      await db.doc(docId(key)).set(serialize(zones));
      results[key] = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results[key] = "error";
      errors[key] = msg;
      // Preserve previous doc; only stamp the error.
      await db.doc(docId(key)).set(
        { nseFetchError: msg, computedAt: new Date().toISOString(), label: INDEX_SPECS[key].label },
        { merge: true },
      );
    }
  }

  return { results, errors };
}

function summarize(payload: { results: Record<string, string>; errors: Record<string, string> }): string {
  const ok = Object.values(payload.results).filter((v) => v === "ok").length;
  const err = Object.keys(payload.errors).length;
  return `ok=${ok}/${INDEX_KEYS.length}${err ? ` errors=${err}` : ""}`;
}

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
    const payload = await run();
    return NextResponse.json({ success: true, summary: summarize(payload), ...payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestIndexZones] Failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const payload = await run();
    return NextResponse.json({ success: true, ...payload });
  } catch (err) {
    console.error("[SuggestIndexZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
