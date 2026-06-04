/**
 * On-demand equity zone compute for a single F&O symbol (user click on
 * /levels chart or slideshow). Uses Dhan option chain — same feed as candles —
 * so visitors never hit NSE scrape paths or see NSE-specific errors.
 *
 * Background cron (`stock-zones-runner`) still uses NSE batching to fill the universe.
 */

import { getAdminFirestore } from "@/firebase/admin";
import { computeEquityZonesDhan } from "@/lib/equity-options-zones-dhan";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  aggregateEntry,
  persistEquityZonesDoc,
  stockDocId,
  writeStockZoneAggregate,
} from "@/lib/equity-zones-store";
import { FNO_UNIVERSE } from "@/lib/nse/fno-universe";

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

export function normalizeStockSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
}

export function isValidFnoSymbol(symbol: string): boolean {
  return FNO_UNIVERSE.includes(normalizeStockSymbol(symbol));
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
    const zones = await computeEquityZonesDhan(safe);
    await persistEquityZonesDoc(db, zones, "dhan_equity");
    if (zones.bullZoneLow != null || zones.bearZoneLow != null) {
      await writeStockZoneAggregate(db, [aggregateEntry(zones)]);
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
