/**
 * On-demand NSE equity zone compute for a single F&O symbol (user click on
 * /levels → NSE Stocks). Uses the shared safe NSE client; persists to the same
 * Firestore docs as the batch cron so the next read is cached.
 */

import { getAdminFirestore } from "@/firebase/admin";
import { createNseSession } from "@/lib/nse/client";
import { NseCircuitOpenError, NseBlockError } from "@/lib/nse/types";
import { computeEquityZones } from "@/lib/equity-options-zones";
import {
  aggregateEntry,
  persistEquityZonesDoc,
  stockDocId,
  writeStockZoneAggregate,
} from "@/lib/equity-zones-store";
import { FNO_UNIVERSE } from "@/lib/nse/fno-universe";

export function normalizeStockSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
}

export function isValidFnoSymbol(symbol: string): boolean {
  return FNO_UNIVERSE.includes(normalizeStockSymbol(symbol));
}

/** Fresh enough to skip an on-demand NSE round-trip (default 15 min). */
export const STOCK_LEVELS_CACHE_TTL_MS = 15 * 60 * 1000;

export async function computeStockZonesOnDemand(symbol: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const safe = normalizeStockSymbol(symbol);
  if (!isValidFnoSymbol(safe)) {
    return { ok: false, error: "Symbol is not in the NSE F&O universe" };
  }

  const db = getAdminFirestore();

  try {
    const session = await createNseSession(db, { maxConsecutiveBlocks: 1 });
    const zones = await computeEquityZones(safe, session);
    await persistEquityZonesDoc(db, zones);
    await writeStockZoneAggregate(db, [aggregateEntry(zones)]);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof NseCircuitOpenError) {
      return { ok: false, error: "NSE is temporarily paused — try again in a few minutes" };
    }
    if (e instanceof NseBlockError) {
      return { ok: false, error: `NSE blocked the request (${msg})` };
    }
    try {
      await db.doc(stockDocId(safe)).set(
        { symbol: safe, label: safe, nseFetchError: msg.slice(0, 300), computedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      /* best-effort */
    }
    return { ok: false, error: msg };
  }
}

export function stockLevelsCacheFresh(computedAt: string | null | undefined): boolean {
  if (!computedAt) return false;
  const t = Date.parse(computedAt);
  return Number.isFinite(t) && Date.now() - t < STOCK_LEVELS_CACHE_TTL_MS;
}
