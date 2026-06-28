/**
 * Refresh per-symbol OI-wall momentum signals onto the zone docs the bubble map
 * and liveslide already read — no NSE, no per-request fan-out.
 *
 * Source: the last 2 daily bhavcopy snapshots in GCS (one object = all symbols).
 * Sinks (deep-merged, so we never clobber the rotating zone-batch writes):
 *   • stocks  → `config/zone_status_stocks` → entries[SYMBOL].oi
 *   • indices → `config/suggested_index_zones_{SYMBOL}` → oi
 *
 * Runs once per `suggest-stock-zones` tick: solves cold start in one pass and
 * keeps the signal current daily. Fail-closed: < 2 cached sessions → no-op.
 */

import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { INDEX_KEYS } from "@/lib/index-specs";
import { getDailySnapshot, type DailySnapshotMap } from "@/lib/oi-bhavcopy-store";
import { lastCompletedTradingSession } from "@/lib/oi-history-ensure";
import {
  computeOiWallMomentumMap,
  type OiWallMomentum,
  type OiWallPoint,
} from "@/lib/zones/oi-momentum-signal";

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";

function indexZonesDocId(symbol: string): string {
  return `config/suggested_index_zones_${symbol}`;
}

function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateKey: string): boolean {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Latest `count` GCS-cached trading-day snapshots, newest first. GCS-only (no NSE). */
async function loadRecentSnapshots(
  now: number,
  count = 2,
  maxProbe = 12,
): Promise<{ date: string; map: DailySnapshotMap }[]> {
  const out: { date: string; map: DailySnapshotMap }[] = [];
  let cursor = lastCompletedTradingSession(now);
  let probes = 0;
  while (out.length < count && probes < maxProbe) {
    if (!isWeekend(cursor)) {
      probes++;
      const map = await getDailySnapshot(cursor, { allowNse: false });
      if (map) out.push({ date: cursor, map });
    }
    cursor = addDaysKey(cursor, -1);
  }
  return out;
}

function toWallPoint(entry: { putOI: number | null; callOI: number | null }): OiWallPoint {
  return { putOI: entry.putOI, callOI: entry.callOI };
}

function wallPointMap(snap: DailySnapshotMap): Record<string, OiWallPoint> {
  const out: Record<string, OiWallPoint> = {};
  for (const [sym, entry] of Object.entries(snap)) out[sym] = toWallPoint(entry);
  return out;
}

export interface OiMomentumRefreshResult {
  ok: boolean;
  reason?: string;
  asOf?: string;
  prevDate?: string;
  /** Symbols with a computed signal in the snapshot. */
  computed: number;
  /** Stock-aggregate entries that received an `oi` patch. */
  stocksPatched: number;
  /** Index docs that received an `oi` patch. */
  indicesPatched: number;
}

/** Read the symbols currently present in the stock aggregate (scanned universe). */
async function loadAggregateSymbols(db: Firestore): Promise<string[]> {
  try {
    const snap = await db.doc(STOCK_AGGREGATE_DOC).get();
    const entries = (snap.data()?.entries ?? {}) as Record<string, unknown>;
    return Object.keys(entries);
  } catch {
    return [];
  }
}

/**
 * Compute + persist OI-wall momentum signals for indices and all scanned stocks.
 * Cheap: 2 GCS reads + 1 aggregate merge + ≤5 index merges. Best-effort.
 */
export async function refreshOiMomentumSignals(
  db: Firestore,
  now: number = Date.now(),
): Promise<OiMomentumRefreshResult> {
  const snaps = await loadRecentSnapshots(now, 2);
  if (snaps.length < 2) {
    return { ok: false, reason: "insufficient_snapshots", computed: 0, stocksPatched: 0, indicesPatched: 0 };
  }

  const [latest, prev] = snaps;
  const signals = computeOiWallMomentumMap(
    wallPointMap(latest.map),
    wallPointMap(prev.map),
    latest.date,
    prev.date,
  );

  // Indices — one merge per existing index doc.
  let indicesPatched = 0;
  await Promise.all(
    INDEX_KEYS.map(async (k) => {
      const sig = signals[k];
      if (!sig) return;
      try {
        await db.doc(indexZonesDocId(k)).set(
          { oi: sig, oiUpdatedAt: new Date().toISOString() },
          { merge: true },
        );
        indicesPatched++;
      } catch {
        /* best-effort */
      }
    }),
  );

  // Stocks — deep-merge an `oi` subfield onto each already-scanned entry only.
  const aggregateSymbols = await loadAggregateSymbols(db);
  const entriesPatch: Record<string, { oi: OiWallMomentum }> = {};
  for (const sym of aggregateSymbols) {
    const sig = signals[sym];
    if (sig) entriesPatch[sym] = { oi: sig };
  }
  const stocksPatched = Object.keys(entriesPatch).length;
  if (stocksPatched > 0) {
    try {
      await db.doc(STOCK_AGGREGATE_DOC).set(
        { entries: entriesPatch, oiUpdatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      /* best-effort */
    }
  }

  return {
    ok: true,
    asOf: latest.date,
    prevDate: prev.date,
    computed: Object.keys(signals).length,
    stocksPatched,
    indicesPatched,
  };
}
