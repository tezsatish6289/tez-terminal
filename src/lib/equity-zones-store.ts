/**
 * Persist equity (stock) option zones for the public levels page + In-Zone tab.
 *
 * Two write targets:
 *   1. `config/suggested_stock_zones_{SYMBOL}` — one doc per stock, in the SAME
 *      field shape as the index docs, so `/api/freedombot/levels` and the shared
 *      `ZonePriceLadder` render stocks with zero new mapping code.
 *   2. `config/zone_status_stocks` — a single compact aggregate (symbol → status)
 *      that powers the cross-tab "In Zone" screener in one read (no fan-out).
 *
 * Last-good preservation: a thin/blocked refresh never wipes existing bands; it
 * only stamps an error so the page keeps showing the previous good levels.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { EquityOptionsZones } from "@/lib/equity-options-zones";
import {
  storedSourceToPublic,
  type PublicLevelsSource,
} from "@/lib/levels/levels-source";
import type { ZoneStatus } from "@/lib/zones/zone-status";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";

const AGGREGATE_DOC = "config/zone_status_stocks";

export function stockDocId(symbol: string): string {
  return `config/suggested_stock_zones_${symbol}`;
}

/** Serialize one expiry slice into maxPainByExpiry row shape. */
function serializeSlice(z: EquityOptionsZones, dayIndex: number) {
  return {
    expiry: z.expiryUsed,
    maxPain: z.maxPain,
    totalOI: z.expiryOI ?? 0,
    dayIndex,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    bullStrike: z.bullStrike,
    bearStrike: z.bearStrike,
    halfWidthUsd: z.halfWidth,
    bullOI: z.bullOI,
    bearOI: z.bearOI,
    bullOIChange: z.bullOIChange,
    bearOIChange: z.bearOIChange,
  };
}

/** Serialize to the shared "suggested zones" shape (mirrors index-zones-store). */
function serialize(
  primary: EquityOptionsZones,
  byExpiry: EquityOptionsZones[],
  source: "nse_equity" | "dhan_equity" = "nse_equity",
) {
  const slices = (byExpiry.length ? byExpiry : [primary]).filter((z) => z.expiryUsed);
  const maxPainByExpiry = slices.map((z, i) => serializeSlice(z, i));
  return {
    symbol: primary.symbol,
    label: primary.label,
    bullStrike: primary.bullStrike,
    bearStrike: primary.bearStrike,
    bullZoneLow: primary.bullZoneLow,
    bullZoneHigh: primary.bullZoneHigh,
    bullExitAbove: primary.bullExitAbove,
    bearZoneLow: primary.bearZoneLow,
    bearZoneHigh: primary.bearZoneHigh,
    bearExitBelow: primary.bearExitBelow,
    bullOI: primary.bullOI,
    bearOI: primary.bearOI,
    bullOIChange: primary.bullOIChange,
    bearOIChange: primary.bearOIChange,
    maxPain: primary.maxPain,
    maxPainByExpiry,
    halfWidthUsd: primary.halfWidth,
    expiryUsed: primary.expiryUsed,
    expiryOI: primary.expiryOI,
    insufficientGap: primary.insufficientGap,
    illiquid: primary.illiquid,
    status: primary.status,
    atmIV: primary.atmIV,
    volRegimeFlag: primary.volRegime.flag,
    volRegimeReason: primary.volRegime.reason,
    daysToEarnings: primary.volRegime.daysToEarnings,
    btcPrice: primary.spot, // ladder reads deribitIndexPrice ?? btcPrice for the spot line
    deribitIndexPrice: null,
    source,
    nseFetchError: null,
    computedAt: primary.computedAt,
  };
}

/** Compact entry for the aggregate In-Zone doc (includes POC for the public ladder). */
export interface StockZoneAggregateEntry {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  halfWidth: number | null;
  atmIV: number | null;
  volRegimeFlag: VolRegimeFlag;
  volRegimeReason: string;
  daysToEarnings: number | null;
  computedAt: string;
  levelsSource: PublicLevelsSource | null;
  /** Day-over-day OI-wall momentum signal (written by the OI-momentum pass, not the zone batch). */
  oi?: OiWallMomentum | null;
}

export function aggregateEntry(
  z: EquityOptionsZones,
  source: "nse_equity" | "dhan_equity" = "nse_equity",
): StockZoneAggregateEntry {
  return {
    symbol: z.symbol,
    label: z.label,
    status: z.status,
    spot: z.spot > 0 ? z.spot : null,
    maxPain: z.maxPain,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    halfWidth: z.halfWidth > 0 ? z.halfWidth : null,
    atmIV: z.atmIV,
    volRegimeFlag: z.volRegime.flag,
    volRegimeReason: z.volRegime.reason,
    daysToEarnings: z.volRegime.daysToEarnings,
    computedAt: z.computedAt,
    levelsSource: storedSourceToPublic(source),
  };
}

/**
 * Write one stock's per-symbol doc with last-good preservation.
 * Returns true when fresh bands were written, false when preserved.
 */
export async function persistEquityZonesDoc(
  db: Firestore,
  primary: EquityOptionsZones,
  source: "nse_equity" | "dhan_equity" = "nse_equity",
  byExpiry: EquityOptionsZones[] = [],
): Promise<boolean> {
  const hasBands = primary.bullZoneLow != null || primary.bearZoneLow != null;
  if (!hasBands) {
    await db.doc(stockDocId(primary.symbol)).set(
      {
        symbol: primary.symbol,
        label: primary.label,
        illiquid: primary.illiquid,
        status: primary.status,
        nseFetchError: primary.illiquid ? "Illiquid / empty option chain" : "No bands derived",
        computedAt: primary.computedAt,
      },
      { merge: true },
    );
    return false;
  }
  await db.doc(stockDocId(primary.symbol)).set(serialize(primary, byExpiry, source));
  return true;
}

/** Stamp an error on a symbol doc without touching its last-good bands. */
export async function stampEquityZonesError(
  db: Firestore,
  symbol: string,
  error: string,
): Promise<void> {
  await db.doc(stockDocId(symbol)).set(
    { symbol, label: symbol, nseFetchError: error.slice(0, 300), computedAt: new Date().toISOString() },
    { merge: true },
  );
}

/**
 * Merge a batch of aggregate entries into the single In-Zone aggregate doc.
 * Uses a nested `entries` map so each run updates only the symbols it processed
 * (Firestore deep-merges map fields), leaving the rest of the universe intact.
 */
export async function writeStockZoneAggregate(
  db: Firestore,
  entries: StockZoneAggregateEntry[],
): Promise<void> {
  if (!entries.length) return;
  const entriesMap: Record<string, StockZoneAggregateEntry> = {};
  for (const e of entries) entriesMap[e.symbol] = e;
  await db.doc(AGGREGATE_DOC).set(
    { entries: entriesMap, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
