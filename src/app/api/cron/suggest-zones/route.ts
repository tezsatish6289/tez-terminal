/**
 * /api/cron/suggest-zones
 *
 * Fetches options OI from Deribit for BTC, ETH, SOL, and XRP, writes zones to:
 *
 *   • config/suggested_zones_{asset}  — per-asset (zone bots + heatmap grid)
 *   • config/suggested_zones          — legacy BTC path (Crypto Bot macro gate)
 *
 * XRP uses Deribit's USDC-margined XRP_USDC option chain.
 *
 * Scheduled: every 15 min via cron-job.org (GET).
 * Also callable manually from the UI Refresh button (POST).
 *
 * NSE index zones (Nifty, Bank Nifty, …) are refreshed by suggest-stock-zones.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeOptionsZones } from "@/lib/options-zones";
import { zoneBandSnapshotFromSuggested } from "@/lib/options-zone-sticky";
import { deserializePrices } from "@/lib/exchanges";
import { type ZoneBotAsset } from "@/lib/zone-bot-config";
import { recordCronHeartbeat } from "@/lib/cron-health";

export const dynamic     = "force-dynamic";
/** Crypto (Deribit) ~10s. */
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/** All Deribit assets refreshed by this cron (includes BTC for the grid). */
const SUGGEST_ZONE_ASSETS: ZoneBotAsset[] = ["btc", "eth", "sol", "xrp"];

const PERP_SYMBOL: Record<ZoneBotAsset, string> = {
  btc: "BTCUSDT",
  eth: "ETHUSDT",
  sol: "SOLUSDT",
  xrp: "XRPUSDT",
};

function serializeSuggested(
  result: Awaited<ReturnType<typeof computeOptionsZones>>,
  spotPrice: number,
) {
  return {
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
    maxPain:           result.maxPain,
    maxPainByExpiry:   result.maxPainByExpiry,
    signalConflict:    result.signalConflict,
    bullTpTarget:      result.bullTpTarget,
    bullTpExpiry:      result.bullTpExpiry,
    bullTpConfidence:  result.bullTpConfidence,
    bearTpTarget:      result.bearTpTarget,
    bearTpExpiry:      result.bearTpExpiry,
    bearTpConfidence:  result.bearTpConfidence,
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
    clusterOiImbalance:  result.clusterOiImbalance,
    clusterOiBalanced:   result.clusterOiBalanced,
    expiryUsed:        result.expiryUsed,
    expiriesUsed:      result.expiriesUsed,
    expiryOI:          result.expiryOI,
    maxPainAnchorSpanUsd: result.maxPainAnchorSpanUsd,
    bullLocked:        result.bullLocked,
    bearLocked:        result.bearLocked,
    btcPrice:          spotPrice,
    deribitIndexPrice: result.deribitIndexPrice,
    source:            "deribit",
    computedAt:        result.computedAt,
  };
}

async function suggestForAsset(
  asset: ZoneBotAsset,
  allPrices: Record<string, Map<string, number>>,
): Promise<Record<string, unknown>> {
  const db = getAdminFirestore();
  const symbol = PERP_SYMBOL[asset];

  const spot =
    allPrices.BYBIT?.get(symbol) ??
    allPrices.BINANCE?.get(symbol) ??
    null;

  if (!spot) throw new Error(`${asset.toUpperCase()} price unavailable`);

  const prevSnap = await db.doc(`config/suggested_zones_${asset}`).get();
  const previousBands = prevSnap.exists
    ? zoneBandSnapshotFromSuggested(prevSnap.data() as Record<string, unknown>)
    : null;

  const result = await computeOptionsZones({
    asset,
    currentPrice: spot,
    previousBands,
  });

  const suggested = serializeSuggested(result, spot);

  const writes: Promise<unknown>[] = [
    db.doc(`config/suggested_zones_${asset}`).set(suggested),
  ];
  if (asset === "btc") {
    writes.push(db.doc("config/suggested_zones").set(suggested));
    writes.push(db.doc("config/suggested_zones_btc").set(suggested));
  }

  await Promise.all(writes);
  return suggested;
}

async function run() {
  const db = getAdminFirestore();

  let allPrices: Record<string, Map<string, number>> = {};
  try {
    const priceDoc = await db.doc("config/exchange_prices").get();
    if (priceDoc.exists) {
      allPrices = deserializePrices(
        priceDoc.data() as Record<string, Record<string, number>>,
      );
    }
  } catch {}

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  await Promise.all(
    SUGGEST_ZONE_ASSETS.map(async (asset) => {
      try {
        results[asset] = await suggestForAsset(asset, allPrices);
      } catch (e) {
        errors[asset] = e instanceof Error ? e.message : String(e);
        console.error(`[SuggestZones] ${asset} failed:`, e);
      }
    }),
  );

  if (Object.keys(results).length === 0) {
    throw new Error(
      Object.values(errors).join("; ") || "All zone suggestions failed",
    );
  }

  return { suggested: results, errors };
}

function summarizeSuggestZones(payload: {
  suggested: Record<string, unknown>;
  errors: Record<string, string>;
}): string {
  const parts: string[] = [];
  for (const [asset, row] of Object.entries(payload.suggested)) {
    const z = row as {
      bullActionable?: boolean;
      bearActionable?: boolean;
      signalConflict?: boolean;
      notActionableReason?: string | null;
    };
    let tag = "idle";
    if (z.bullActionable || z.bearActionable) tag = "actionable";
    else if (z.notActionableReason) tag = "blocked";
    parts.push(`${asset}=${tag}`);
  }
  const errN = Object.keys(payload.errors).length;
  if (errN > 0) parts.push(`errors=${errN}`);
  return parts.join(" ");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const db = getAdminFirestore();
  try {
    const payload = await run();
    // Crypto monitoring is locked in BEFORE the NSE pass runs, so a slow or
    // failing NSE fetch can never flip this cron's heartbeat or alert.
    await recordCronHeartbeat(db, "suggest-zones", {
      ok: true,
      summary: summarizeSuggestZones(payload),
      durationMs: Date.now() - startedAt,
    });
    // NSE index zones are refreshed by suggest-stock-zones (levels cron) — not here.
    return NextResponse.json({
      success: true,
      ...payload,
      indexZones: {
        skipped: "use_suggest_stock_zones",
        hint: "NSE indices refresh on /api/cron/suggest-stock-zones during market hours",
      },
      stockZones: {
        skipped: "use_dedicated_cron",
        hint: "F&O stocks run only on /api/cron/suggest-stock-zones",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestZones] Failed:", err);
    await recordCronHeartbeat(db, "suggest-zones", {
      ok: false,
      error: msg,
      durationMs: Date.now() - startedAt,
    }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const payload = await run();
    return NextResponse.json({
      success: true,
      ...payload,
      indexZones: {
        skipped: "use_suggest_stock_zones",
        hint: "POST /api/cron/suggest-stock-zones to refresh NSE index zones",
      },
      stockZones: { skipped: "use_dedicated_cron" },
    });
  } catch (err) {
    console.error("[SuggestZones] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

