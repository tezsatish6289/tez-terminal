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
import type { ZoneStatus } from "@/lib/zones/zone-status";

const AGGREGATE_DOC = "config/zone_status_stocks";

export function stockDocId(symbol: string): string {
  return `config/suggested_stock_zones_${symbol}`;
}

/** Serialize to the shared "suggested zones" shape (mirrors index-zones-store). */
function serialize(z: EquityOptionsZones) {
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
    halfWidthUsd: z.halfWidth,
    expiryUsed: z.expiryUsed,
    expiryOI: z.expiryOI,
    insufficientGap: z.insufficientGap,
    illiquid: z.illiquid,
    status: z.status,
    btcPrice: z.spot, // ladder reads deribitIndexPrice ?? btcPrice for the spot line
    deribitIndexPrice: null,
    source: "nse_equity",
    nseFetchError: null,
    computedAt: z.computedAt,
  };
}

/** Compact entry for the aggregate In-Zone doc. */
export interface StockZoneAggregateEntry {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  computedAt: string;
}

export function aggregateEntry(z: EquityOptionsZones): StockZoneAggregateEntry {
  return {
    symbol: z.symbol,
    label: z.label,
    status: z.status,
    spot: z.spot > 0 ? z.spot : null,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    computedAt: z.computedAt,
  };
}

/**
 * Write one stock's per-symbol doc with last-good preservation.
 * Returns true when fresh bands were written, false when preserved.
 */
export async function persistEquityZonesDoc(
  db: Firestore,
  z: EquityOptionsZones,
): Promise<boolean> {
  const hasBands = z.bullZoneLow != null || z.bearZoneLow != null;
  if (!hasBands) {
    await db.doc(stockDocId(z.symbol)).set(
      {
        symbol: z.symbol,
        label: z.label,
        illiquid: z.illiquid,
        status: z.status,
        nseFetchError: z.illiquid ? "Illiquid / empty option chain" : "No bands derived",
        computedAt: z.computedAt,
      },
      { merge: true },
    );
    return false;
  }
  await db.doc(stockDocId(z.symbol)).set(serialize(z));
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
