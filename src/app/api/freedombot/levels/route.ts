/**
 * /api/freedombot/levels
 *
 * Public read for the freedombot.ai/levels page. Returns the latest
 * algorithmically-derived bull/bear zones for:
 *   • NSE indices  → config/suggested_index_zones_{SYMBOL}  (suggest-stock-zones cron)
 *   • NSE stocks   → config/suggested_stock_zones_{SYMBOL}  (suggest-stock-zones cron)
 *
 * Modes:
 *   • GET (no params)        → { indices, stocks (compact), inZone, updatedAt }
 *   • GET ?symbol=RELIANCE   → { symbol, label, data } single stock's full ladder payload
 *
 * IMPORTANT: the stored docs carry the full derivation (strikes, OI, max-pain by
 * expiry, cluster shares, IV, source, …). We deliberately do NOT return them raw —
 * each doc is projected to a neutral, render-only payload (`PublicLevels`) so the
 * methodology never reaches the browser/network tab. Only the fields the public
 * ladder draws are exposed, under neutral key names.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-options-zones";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildLevelsActionableList,
  type LevelsActionableItem,
} from "@/lib/zones/levels-actionable-list";
import {
  computeStockZonesOnDemand,
  normalizeStockSymbol,
  stockLevelsCacheFresh,
  stockLevelsCacheFreshSlideshow,
  stockLevelsHasBands,
  stockLevelsLadderComplete,
  STOCK_LEVELS_PUBLIC_ERROR,
} from "@/lib/equity-zones-on-demand";
import { stockDocId } from "@/lib/equity-zones-store";
import { storedSourceToPublic } from "@/lib/levels/levels-source";
import { loadFnoUniverse, isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import type { ZoneStatus } from "@/lib/zones/zone-status";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";

const VOL_REGIME_FLAGS: readonly VolRegimeFlag[] = ["CALM", "ELEVATED", "EARNINGS", "UNKNOWN"];

function volRegimeFlag(raw: unknown): VolRegimeFlag | null {
  return typeof raw === "string" && (VOL_REGIME_FLAGS as readonly string[]).includes(raw)
    ? (raw as VolRegimeFlag)
    : null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** On-demand NSE fetch for a single stock can take ~10–15s. */
export const maxDuration = 60;

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(raw: unknown): boolean | null {
  return raw === true ? true : raw === false ? false : null;
}

/** Strip the stored doc down to the neutral fields the public ladder renders. */
function sanitize(raw: Record<string, unknown> | null): PublicLevels | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    poc: num(raw.maxPain),
    bullLow: num(raw.bullZoneLow),
    bullHigh: num(raw.bullZoneHigh),
    bearLow: num(raw.bearZoneLow),
    bearHigh: num(raw.bearZoneHigh),
    bandOffset: num(raw.halfWidthUsd),
    bullActive: bool(raw.bullActionable),
    bearActive: bool(raw.bearActionable),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
    unavailable: typeof raw.nseFetchError === "string" && raw.nseFetchError !== "",
    levelsSource: storedSourceToPublic(
      typeof raw.source === "string" ? raw.source : null,
    ),
    volRegime: volRegimeFlag(raw.volRegimeFlag),
    volRegimeReason: typeof raw.volRegimeReason === "string" ? raw.volRegimeReason : null,
    atmIV: num(raw.atmIV),
    daysToEarnings: num(raw.daysToEarnings),
    zonesExpiry: resolveZonesExpiryFromStored(raw),
    putClusterSize: num(raw.bullOI),
    callClusterSize: num(raw.bearOI),
    putClusterStrike: num(raw.bullStrike),
    callClusterStrike: num(raw.bearStrike),
  };
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface StockAggregateEntry {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
  halfWidth?: number | null;
  atmIV?: number | null;
  volRegimeFlag?: string | null;
  volRegimeReason?: string | null;
  daysToEarnings?: number | null;
  computedAt?: string;
  levelsSource?: string | null;
}

/**
 * Single-stock ladder payload. Reads Firestore first; if missing, stale, or
 * without bands, runs an on-demand NSE compute (the planned click-to-fetch path).
 */
async function getSingleStock(symbol: string, forceRefresh: boolean, slideshowPriority: boolean) {
  const db = getAdminFirestore();
  const safe = normalizeStockSymbol(symbol);
  if (!(await isValidFnoSymbolDb(db, safe))) {
    return NextResponse.json({ error: "Unknown F&O symbol" }, { status: 400 });
  }

  let raw = await readDoc(stockDocId(safe));
  let data = sanitize(raw);
  const cachedBeforeRefresh = data;
  const cachedFresh = slideshowPriority
    ? stockLevelsCacheFreshSlideshow(data?.computedAt) && stockLevelsLadderComplete(data)
    : stockLevelsCacheFresh(data?.computedAt) && stockLevelsLadderComplete(data);

  if (forceRefresh || !cachedFresh) {
    const result = await computeStockZonesOnDemand(safe);
    raw = await readDoc(stockDocId(safe));
    data = sanitize(raw);
    if (stockLevelsLadderComplete(data)) {
      return NextResponse.json(
        {
          symbol: safe,
          label: (typeof raw?.label === "string" && raw.label) || safe,
          data,
          source: "live",
          computed: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (stockLevelsHasBands(cachedBeforeRefresh)) {
      return NextResponse.json(
        {
          symbol: safe,
          label: (typeof raw?.label === "string" && raw.label) || safe,
          data: cachedBeforeRefresh,
          source: "cache",
          computed: false,
          stale: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        symbol: safe,
        label: (typeof raw?.label === "string" && raw.label) || safe,
        data,
        source: "live",
        computed: result.ok,
        error: STOCK_LEVELS_PUBLIC_ERROR,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const label = (typeof raw?.label === "string" && raw.label) || safe;
  return NextResponse.json(
    { symbol: safe, label, data, source: "cache", computed: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol");
  if (symbol) {
    const forceRefresh = params.get("refresh") === "1" || params.get("compute") === "1";
    const slideshowPriority = params.get("slideshow") === "1";
    return getSingleStock(symbol, forceRefresh, slideshowPriority);
  }

  const [indexDocs, stockAgg, fnoUniverse] = await Promise.all([
    Promise.all(INDEX_KEYS.map((k) => readDoc(`config/suggested_index_zones_${k}`))),
    readDoc(STOCK_AGGREGATE_DOC),
    loadFnoUniverse(getAdminFirestore()),
  ]);

  const indices = INDEX_KEYS.map((k, i) => {
    const data = sanitize(indexDocs[i]);
    const withSource =
      data && !data.levelsSource && (data.bullLow != null || data.bearLow != null)
        ? { ...data, levelsSource: "nse" as const }
        : data;
    return {
      symbol: k,
      label: INDEX_SPECS[k].label,
      data: withSource,
    };
  });

  // Compact stock list (from the aggregate doc — one read, not N).
  const stockEntries = (stockAgg?.entries ?? {}) as Record<string, StockAggregateEntry>;
  const stocks = Object.values(stockEntries)
    .filter((e) => e && typeof e.symbol === "string")
    .map((e) => ({
      symbol: e.symbol,
      label: e.label ?? e.symbol,
      status: e.status,
      spot: e.spot ?? null,
      maxPain: num(e.maxPain),
      bullZoneLow: num(e.bullZoneLow),
      bullZoneHigh: num(e.bullZoneHigh),
      bearZoneLow: num(e.bearZoneLow),
      bearZoneHigh: num(e.bearZoneHigh),
      halfWidth: num(e.halfWidth),
      atmIV: num(e.atmIV),
      volRegime: volRegimeFlag(e.volRegimeFlag),
      volRegimeReason: typeof e.volRegimeReason === "string" ? e.volRegimeReason : null,
      daysToEarnings: num(e.daysToEarnings),
      computedAt: typeof e.computedAt === "string" ? e.computedAt : null,
      levelsSource: storedSourceToPublic(
        typeof e.levelsSource === "string" ? e.levelsSource : null,
      ),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const inZone: LevelsActionableItem[] = buildLevelsActionableList({
    indices,
    stocks,
    filter: "all",
  });

  return NextResponse.json(
    { indices, stocks, inZone, fnoUniverse: [...fnoUniverse], updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
