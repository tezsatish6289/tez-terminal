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
 *   • GET ?symbol=NIFTY&scope=index → single index with on-demand multi-expiry refresh
 *
 * IMPORTANT: the stored docs carry the full derivation (strikes, OI, max-pain by
 * expiry, cluster shares, IV, source, …). We deliberately do NOT return them raw —
 * each doc is projected to a neutral, render-only payload (`PublicLevels`) so the
 * methodology never reaches the browser/network tab. Only the fields the public
 * ladder draws are exposed, under neutral key names.
 */

import { after, NextRequest, NextResponse } from "next/server";
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
  stockLevelsNeedsMultiExpiryRefresh,
  STOCK_LEVELS_PUBLIC_ERROR,
} from "@/lib/equity-zones-on-demand";
import { stockDocId } from "@/lib/equity-zones-store";
import { storedSourceToPublic } from "@/lib/levels/levels-source";
import { loadFnoUniverse, isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import { indexExpiryLevelsFromStored, applyExpiryToPublicLevels } from "@/lib/levels/index-expiry-levels";
import { levelsNeedMultiExpiryRefresh } from "@/lib/levels/multi-expiry-levels";
import {
  computeIndexZonesOnDemand,
  indexLevelsLabel,
  normalizeIndexKey,
} from "@/lib/index-zones-on-demand";
import { indexDocId } from "@/lib/index-zones-store";
import { getConfirmedSignalsCached } from "@/lib/levels/confirmed-signal";
import { createRefreshGuard } from "@/lib/levels/levels-refresh-guard";
import type { ZoneStatus } from "@/lib/zones/zone-status";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";

const VOL_REGIME_FLAGS: readonly VolRegimeFlag[] = ["CALM", "ELEVATED", "EARNINGS", "UNKNOWN"];

/** Pass through a stored OI-wall momentum signal (best-effort shape check). */
function oiSignal(raw: unknown): OiWallMomentum | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.asOf !== "string" || typeof o.dominancePct !== "number") return null;
  return o as unknown as OiWallMomentum;
}

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

/**
 * Single-flight/throttle guards for the stale-while-revalidate path: when a
 * cached ladder is renderable but stale, we serve it immediately and recompute
 * in the background. These keep concurrent chart opens for the same symbol from
 * stacking NSE recomputes. Module scope = one per server instance.
 */
const stockRefreshGuard = createRefreshGuard({ minIntervalMs: 15_000 });
const indexRefreshGuard = createRefreshGuard({ minIntervalMs: 15_000 });

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
function sanitize(
  raw: Record<string, unknown> | null,
  opts?: { includeExpiries?: boolean; includeIndexExpiries?: boolean },
): PublicLevels | null {
  if (!raw || typeof raw !== "object") return null;
  const includeExpiries = opts?.includeExpiries ?? opts?.includeIndexExpiries ?? false;
  const { expiryOptions, zonesByExpiry } = includeExpiries
    ? indexExpiryLevelsFromStored(raw)
    : { expiryOptions: [], zonesByExpiry: [] };
  const base: PublicLevels = {
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
    putClusterChange: num(raw.bullOIChange),
    callClusterChange: num(raw.bearOIChange),
    oi: oiSignal(raw.oi),
    ...(expiryOptions.length > 0 ? { expiryOptions, zonesByExpiry } : {}),
  };
  if (zonesByExpiry.length > 0) {
    return applyExpiryToPublicLevels(base, expiryOptions[0]?.key) ?? base;
  }
  return base;
}

function withNseSource(data: PublicLevels | null): PublicLevels | null {
  if (!data) return null;
  if (data.levelsSource || (data.bullLow == null && data.bearLow == null)) return data;
  return { ...data, levelsSource: "nse" };
}

/** True when the public ladder can render bands (at least one side). */
function levelsHaveBandsData(data: PublicLevels | null): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

/**
 * Single-index ladder payload. Recomputes from NSE when multi-expiry slices are
 * missing. Stale-while-revalidate: if a renderable ladder is cached, serve it
 * immediately and refresh in the background (unless `explicitCompute`).
 */
async function getSingleIndex(symbol: string, forceRefresh: boolean, explicitCompute: boolean) {
  const key = normalizeIndexKey(symbol);
  if (!key) {
    return NextResponse.json({ error: "Unknown index symbol" }, { status: 400 });
  }

  let raw = await readDoc(indexDocId(key));
  let data = withNseSource(sanitize(raw, { includeExpiries: true }));
  const cachedBeforeRefresh = data;
  const needsMultiExpiry = levelsNeedMultiExpiryRefresh(data);
  const needsRecompute = forceRefresh || needsMultiExpiry;

  // Serve renderable cache now, recompute in the background — the chart paints
  // instantly and its poll picks up the refreshed ladder shortly after.
  if (needsRecompute && !explicitCompute && levelsHaveBandsData(data)) {
    after(async () => {
      await indexRefreshGuard.run(key, () => computeIndexZonesOnDemand(key));
    });
    return NextResponse.json(
      {
        symbol: key,
        label: (typeof raw?.label === "string" && raw.label) || indexLevelsLabel(key),
        data,
        source: "cache",
        computed: false,
        stale: true,
        refreshing: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (needsRecompute) {
    await computeIndexZonesOnDemand(key);
    raw = await readDoc(indexDocId(key));
    data = withNseSource(sanitize(raw, { includeExpiries: true }));
    if (data && (data.bullLow != null || data.bearLow != null) && data.poc != null) {
      return NextResponse.json(
        {
          symbol: key,
          label: (typeof raw?.label === "string" && raw.label) || indexLevelsLabel(key),
          data,
          source: "live",
          computed: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (cachedBeforeRefresh && (cachedBeforeRefresh.bullLow != null || cachedBeforeRefresh.bearLow != null)) {
      return NextResponse.json(
        {
          symbol: key,
          label: indexLevelsLabel(key),
          data: cachedBeforeRefresh,
          source: "cache",
          computed: false,
          stale: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const label = (typeof raw?.label === "string" && raw.label) || indexLevelsLabel(key);
  return NextResponse.json(
    { symbol: key, label, data, source: "cache", computed: false },
    { headers: { "Cache-Control": "no-store" } },
  );
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
  oi?: OiWallMomentum | null;
}

/**
 * Single-stock ladder payload. Reads Firestore first; if missing, stale, or
 * without bands, runs an on-demand NSE compute (the planned click-to-fetch path).
 */
async function getSingleStock(
  symbol: string,
  forceRefresh: boolean,
  slideshowPriority: boolean,
  explicitCompute: boolean,
) {
  const db = getAdminFirestore();
  const safe = normalizeStockSymbol(symbol);
  if (!(await isValidFnoSymbolDb(db, safe))) {
    return NextResponse.json({ error: "Unknown F&O symbol" }, { status: 400 });
  }

  let raw = await readDoc(stockDocId(safe));
  let data = sanitize(raw, { includeExpiries: true });
  const cachedBeforeRefresh = data;
  const cachedFresh = slideshowPriority
    ? stockLevelsCacheFreshSlideshow(data?.computedAt) && stockLevelsLadderComplete(data)
    : stockLevelsCacheFresh(data?.computedAt) && stockLevelsLadderComplete(data);
  const needsMultiExpiry = stockLevelsNeedsMultiExpiryRefresh(data);
  const needsRecompute = forceRefresh || !cachedFresh || needsMultiExpiry;

  // Stale-while-revalidate: a renderable (banded) ladder is served instantly and
  // refreshed in the background, so the chart never blocks on a ~10–15s NSE
  // recompute. The chart's own poll picks up the fresh ladder moments later.
  if (needsRecompute && !explicitCompute && stockLevelsHasBands(data)) {
    after(async () => {
      await stockRefreshGuard.run(safe, () => computeStockZonesOnDemand(safe));
    });
    return NextResponse.json(
      {
        symbol: safe,
        label: (typeof raw?.label === "string" && raw.label) || safe,
        data,
        source: "cache",
        computed: false,
        stale: true,
        refreshing: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (needsRecompute) {
    const result = await computeStockZonesOnDemand(safe);
    raw = await readDoc(stockDocId(safe));
    data = sanitize(raw, { includeExpiries: true });
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
    // `compute=1` = explicit "recompute now" (blocking); `refresh=1`/staleness
    // are eligible for the non-blocking stale-while-revalidate path.
    const explicitCompute = params.get("compute") === "1";
    const forceRefresh = params.get("refresh") === "1" || explicitCompute;
    const scope = params.get("scope");
    if (scope === "index") {
      return getSingleIndex(symbol, forceRefresh, explicitCompute);
    }
    const slideshowPriority = params.get("slideshow") === "1";
    return getSingleStock(symbol, forceRefresh, slideshowPriority, explicitCompute);
  }

  const [indexDocs, stockAgg, fnoUniverse, signals] = await Promise.all([
    Promise.all(INDEX_KEYS.map((k) => readDoc(`config/suggested_index_zones_${k}`))),
    readDoc(STOCK_AGGREGATE_DOC),
    loadFnoUniverse(getAdminFirestore()),
    getConfirmedSignalsCached(getAdminFirestore()),
  ]);

  const indices = INDEX_KEYS.map((k, i) => {
    const data = sanitize(indexDocs[i], { includeExpiries: true });
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
      oi: oiSignal(e.oi),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const inZone: LevelsActionableItem[] = buildLevelsActionableList({
    indices,
    stocks,
    filter: "all",
  });

  return NextResponse.json(
    { indices, stocks, inZone, signals, fnoUniverse: [...fnoUniverse], updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
