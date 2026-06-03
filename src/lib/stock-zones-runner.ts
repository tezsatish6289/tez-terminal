/**
 * Round-robin NSE F&O stock zone batch — shared by dedicated cron and the
 * `suggest-zones` piggyback pass (so stocks advance on the same schedule as indices).
 */

import type { Firestore } from "firebase-admin/firestore";
import { runNseBatch } from "@/lib/nse/client";
import { nextBatch, FNO_UNIVERSE } from "@/lib/nse/fno-universe";
import { computeEquityZones } from "@/lib/equity-options-zones";
import {
  persistEquityZonesDoc,
  stampEquityZonesError,
  writeStockZoneAggregate,
  aggregateEntry,
  type StockZoneAggregateEntry,
} from "@/lib/equity-zones-store";

const CURSOR_DOC = "config/stock_zones_cursor";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function readCursor(db: Firestore): Promise<number> {
  try {
    const snap = await db.doc(CURSOR_DOC).get();
    const v = snap.exists ? (snap.data() as { index?: number }).index : 0;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

async function writeCursor(db: Firestore, index: number): Promise<void> {
  try {
    await db.doc(CURSOR_DOC).set({ index, updatedAt: new Date().toISOString() }, { merge: true });
  } catch {
    /* best-effort */
  }
}

export interface StockZonesBatchSummary {
  processed: number;
  ok: number;
  errors: number;
  timedOut: boolean;
  aborted: string | null;
  symbols: string[];
  universeSize: number;
  cursorBefore: number;
}

export interface StockZonesBatchOptions {
  /** Max symbols to dequeue this run (default from STOCK_ZONES_BATCH_SIZE). */
  batchSize?: number;
  delayMs?: number;
  maxWallClockMs?: number;
  symbolsOverride?: string[];
}

/**
 * Run one round-robin batch. `symbolsOverride` bypasses the queue (manual refresh).
 */
export async function runStockZonesBatch(
  db: Firestore,
  opts: StockZonesBatchOptions = {},
): Promise<StockZonesBatchSummary> {
  const batchSize = opts.batchSize ?? envNum("STOCK_ZONES_BATCH_SIZE", 32);
  const delayMs = opts.delayMs ?? envNum("STOCK_ZONES_DELAY_MS", 1_000);
  const maxWallClockMs = opts.maxWallClockMs ?? envNum("STOCK_ZONES_MAX_RUN_MS", 50_000);

  const fromQueue = !(opts.symbolsOverride && opts.symbolsOverride.length);
  const startCursor = fromQueue ? await readCursor(db) : 0;

  let symbols: string[];
  if (!fromQueue) {
    symbols = opts.symbolsOverride!.filter((s) => FNO_UNIVERSE.includes(s));
  } else {
    symbols = nextBatch(startCursor, batchSize).symbols;
  }

  if (!symbols.length) {
    return {
      processed: 0,
      ok: 0,
      errors: 0,
      timedOut: false,
      aborted: null,
      symbols: [],
      universeSize: FNO_UNIVERSE.length,
      cursorBefore: startCursor,
    };
  }

  const batch = await runNseBatch<StockZoneAggregateEntry>(
    db,
    symbols,
    async (symbol, session) => {
      const zones = await computeEquityZones(symbol, session);
      await persistEquityZonesDoc(db, zones);
      return aggregateEntry(zones);
    },
    { delayMs, maxWallClockMs },
  );

  const entries: StockZoneAggregateEntry[] = [];
  let okCount = 0;
  for (const r of batch.results) {
    if (r.ok && r.data) {
      entries.push(r.data);
      okCount++;
    } else if (r.error && !r.error.startsWith("skipped")) {
      await stampEquityZonesError(db, r.symbol, r.error);
    }
  }

  await writeStockZoneAggregate(db, entries);

  if (fromQueue && batch.processedCount > 0) {
    await writeCursor(db, (startCursor + batch.processedCount) % FNO_UNIVERSE.length);
  }

  return {
    processed: batch.processedCount,
    ok: okCount,
    errors: okCount < batch.processedCount ? batch.processedCount - okCount : 0,
    timedOut: batch.timedOut,
    aborted: batch.abortedReason,
    symbols,
    universeSize: FNO_UNIVERSE.length,
    cursorBefore: startCursor,
  };
}

/** Smaller batch for the suggest-zones piggyback (fits ~90s route budget). */
export function runStockZonesPiggyback(db: Firestore): Promise<StockZonesBatchSummary> {
  return runStockZonesBatch(db, {
    batchSize: envNum("STOCK_ZONES_PIGGYBACK_SIZE", 12),
    maxWallClockMs: envNum("STOCK_ZONES_PIGGYBACK_MAX_MS", 38_000),
  });
}
