/**
 * On-demand equity zone compute for a single F&O symbol (chart / slideshow).
 * Tries NSE first (same as cron); falls back to Dhan when NSE blocks.
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { createNseSession } from "@/lib/nse/client";
import { computeStockZonesWithFallback } from "@/lib/equity-zones-fetch";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  aggregateEntry,
  persistEquityZonesDoc,
  stockDocId,
  writeStockZoneAggregate,
  type StockZoneAggregateEntry,
} from "@/lib/equity-zones-store";
import { maybeRecordSrZoneEvent } from "@/lib/sr-audit/record-event";

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";
import {
  isValidFnoSymbol,
  normalizeStockSymbol,
} from "@/lib/nse/fno-symbol";

export { isValidFnoSymbol, normalizeStockSymbol };

/** Shown in API/UI — never mentions upstream data providers. */
export const STOCK_LEVELS_PUBLIC_ERROR =
  "Levels aren't available for this symbol yet. Try again in a moment.";

/** True when the public ladder can render bands (at least one side). */
export function stockLevelsHasBands(data: PublicLevels | null | undefined): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

/** Bands + Point of Control (max pain) — required for a complete cached stock ladder. */
export function stockLevelsLadderComplete(data: PublicLevels | null | undefined): boolean {
  return stockLevelsHasBands(data) && data!.poc != null;
}

/** Fresh enough to skip an on-demand round-trip (default 15 min). */
export const STOCK_LEVELS_CACHE_TTL_MS = 15 * 60 * 1000;

/** Slideshow in-zone symbols: tighter freshness (matches slideshow-zones.ts). */
export const SLIDESHOW_STOCK_LEVELS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function computeStockZonesOnDemand(symbol: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const safe = normalizeStockSymbol(symbol);
  if (!isValidFnoSymbol(safe)) {
    return { ok: false, error: STOCK_LEVELS_PUBLIC_ERROR };
  }

  const db = getAdminFirestore();

  try {
    let session = null;
    try {
      session = await createNseSession(db);
    } catch {
      session = null;
    }

    const { zones, source } = await computeStockZonesWithFallback(safe, session);
    let prevEntry: StockZoneAggregateEntry | undefined;
    try {
      const agg = await db.doc(STOCK_AGGREGATE_DOC).get();
      const entries = (agg.data()?.entries ?? {}) as Record<
        string,
        StockZoneAggregateEntry | undefined
      >;
      prevEntry = entries[safe];
    } catch {
      /* best-effort */
    }
    await persistEquityZonesDoc(db, zones, source);
    await maybeRecordSrZoneEvent(db, zones, source, prevEntry);
    if (zones.bullZoneLow != null || zones.bearZoneLow != null) {
      await writeStockZoneAggregate(db, [aggregateEntry(zones, source)]);
    }
    return { ok: zones.bullZoneLow != null || zones.bearZoneLow != null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[stock-zones-on-demand] ${safe}: ${msg}`);
    try {
      await db.doc(stockDocId(safe)).set(
        {
          symbol: safe,
          label: safe,
          nseFetchError: "refresh_pending",
          computedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch {
      /* best-effort */
    }
    return { ok: false, error: STOCK_LEVELS_PUBLIC_ERROR };
  }
}

export function stockLevelsCacheFresh(computedAt: string | null | undefined): boolean {
  if (!computedAt) return false;
  const t = Date.parse(computedAt);
  return Number.isFinite(t) && Date.now() - t < STOCK_LEVELS_CACHE_TTL_MS;
}

export function stockLevelsCacheFreshSlideshow(
  computedAt: string | null | undefined,
): boolean {
  if (!computedAt) return false;
  const t = Date.parse(computedAt);
  return Number.isFinite(t) && Date.now() - t < SLIDESHOW_STOCK_LEVELS_CACHE_TTL_MS;
}
