/**
 * F&O stock zone batch for `/api/cron/suggest-stock-zones` only.
 *
 * Scheduling (`nextStockZonesBatch` in fno-universe.ts):
 *   • Universe: static `FNO_UNIVERSE` (193, Tier B first).
 *   • Cursor: `config/stock_zones_cursor.index`.
 *   • Backlog: symbols not in `zone_status_stocks.entries`.
 *   • Refresh: all scanned → oldest `computedAt` first.
 *
 * Fetch: NSE option chain per symbol; on block/circuit failure → Dhan fallback.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { NseSession } from "@/lib/nse/client";
import { createNseSession } from "@/lib/nse/client";
import { NseBlockError, NseCircuitOpenError } from "@/lib/nse/types";
import {
  nextStockZonesBatch,
  FNO_UNIVERSE,
  type StockAggregateMeta,
} from "@/lib/nse/fno-universe";
import { computeEquityZones } from "@/lib/equity-options-zones";
import { computeEquityZonesDhan } from "@/lib/equity-options-zones-dhan";
import {
  persistEquityZonesDoc,
  stampEquityZonesError,
  writeStockZoneAggregate,
  aggregateEntry,
  type StockZoneAggregateEntry,
} from "@/lib/equity-zones-store";

const CURSOR_DOC = "config/stock_zones_cursor";
const AGGREGATE_DOC = "config/zone_status_stocks";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
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

async function readAggregateState(db: Firestore): Promise<{
  scanned: Set<string>;
  bySymbol: Map<string, StockAggregateMeta>;
}> {
  const scanned = new Set<string>();
  const bySymbol = new Map<string, StockAggregateMeta>();
  try {
    const snap = await db.doc(AGGREGATE_DOC).get();
    const entries = (snap.data()?.entries ?? {}) as Record<
      string,
      { computedAt?: string } | undefined
    >;
    for (const [sym, row] of Object.entries(entries)) {
      scanned.add(sym);
      bySymbol.set(sym, {
        computedAt: typeof row?.computedAt === "string" ? row.computedAt : null,
      });
    }
  } catch {
    /* empty */
  }
  return { scanned, bySymbol };
}

function nseFallbackEligible(err: unknown): boolean {
  if (err instanceof NseBlockError || err instanceof NseCircuitOpenError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("nse circuit") ||
      m.includes("nse empty") ||
      m.includes("nse non_json") ||
      m.includes("session not established") ||
      m.includes("rate limiter")
    );
  }
  return false;
}

async function computeZonesWithFallback(
  symbol: string,
  session: NseSession | null,
): Promise<{ zones: Awaited<ReturnType<typeof computeEquityZones>>; source: "nse_equity" | "dhan_equity" }> {
  const preferDhan = envBool("STOCK_ZONES_DHAN_PRIMARY", false);

  if (!preferDhan && session) {
    try {
      const zones = await computeEquityZones(symbol, session);
      return { zones, source: "nse_equity" };
    } catch (e) {
      if (!nseFallbackEligible(e)) throw e;
    }
  }

  const zones = await computeEquityZonesDhan(symbol);
  return { zones, source: "dhan_equity" };
}

export interface StockZonesBatchSummary {
  processed: number;
  ok: number;
  errors: number;
  nseOk: number;
  dhanOk: number;
  timedOut: boolean;
  aborted: string | null;
  symbols: string[];
  universeSize: number;
  cursorBefore: number;
  queueMode: "backlog" | "refresh";
  scannedInAggregate: number;
  backlogRemaining: number;
  queueLength: number;
  nseSession: "ok" | "circuit_open" | "failed";
}

export interface StockZonesBatchOptions {
  batchSize?: number;
  delayMs?: number;
  maxWallClockMs?: number;
  symbolsOverride?: string[];
}

/**
 * Run one planned batch. `symbolsOverride` bypasses the queue (manual refresh).
 */
export async function runStockZonesBatch(
  db: Firestore,
  opts: StockZonesBatchOptions = {},
): Promise<StockZonesBatchSummary> {
  /** App Hosting runConfig.timeoutSeconds is 120 — keep each cron tick under ~95s. */
  const batchSize = opts.batchSize ?? envNum("STOCK_ZONES_BATCH_SIZE", 10);
  const delayMs = opts.delayMs ?? envNum("STOCK_ZONES_DELAY_MS", 600);
  const dhanDelayMs = envNum("STOCK_ZONES_DHAN_DELAY_MS", 400);
  const maxWallClockMs = opts.maxWallClockMs ?? envNum("STOCK_ZONES_MAX_RUN_MS", 95_000);
  const perSymbolMs = envNum("STOCK_ZONES_SYMBOL_TIMEOUT_MS", 40_000);

  const fromQueue = !(opts.symbolsOverride && opts.symbolsOverride.length);
  const startCursor = fromQueue ? await readCursor(db) : 0;
  const { scanned, bySymbol } = fromQueue
    ? await readAggregateState(db)
    : { scanned: new Set<string>(), bySymbol: new Map<string, StockAggregateMeta>() };

  let symbols: string[] = [];
  let queueMode: "backlog" | "refresh" = "refresh";
  let queueLength = FNO_UNIVERSE.length;

  if (!fromQueue) {
    symbols = opts.symbolsOverride!.filter((s) => FNO_UNIVERSE.includes(s));
  } else {
    const picked = nextStockZonesBatch(startCursor, batchSize, scanned, bySymbol);
    symbols = picked.symbols;
    queueMode = picked.mode;
    queueLength = picked.queueLength;
  }

  const backlogRemaining = FNO_UNIVERSE.filter((s) => !scanned.has(s)).length;

  const emptySummary = (): StockZonesBatchSummary => ({
    processed: 0,
    ok: 0,
    errors: 0,
    nseOk: 0,
    dhanOk: 0,
    timedOut: false,
    aborted: null,
    symbols: [],
    universeSize: FNO_UNIVERSE.length,
    cursorBefore: startCursor,
    queueMode,
    scannedInAggregate: scanned.size,
    backlogRemaining,
    queueLength,
    nseSession: "failed",
  });

  if (!symbols.length) return emptySummary();

  let session: NseSession | null = null;
  let nseSession: StockZonesBatchSummary["nseSession"] = "ok";
  try {
    session = await createNseSession(db);
  } catch (e) {
    if (e instanceof NseCircuitOpenError) nseSession = "circuit_open";
    else nseSession = "failed";
    session = null;
  }

  const startedAt = Date.now();
  const entries: StockZoneAggregateEntry[] = [];
  let processed = 0;
  let okCount = 0;
  let nseOk = 0;
  let dhanOk = 0;
  let timedOut = false;
  let aborted: string | null = null;

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    if (i > 0 && Date.now() - startedAt > maxWallClockMs) {
      timedOut = true;
      break;
    }

    try {
      const { zones, source } = await Promise.race([
        computeZonesWithFallback(symbol, session),
        sleep(perSymbolMs).then(() => {
          throw new Error(`symbol_timeout_${perSymbolMs}ms`);
        }),
      ]);
      await persistEquityZonesDoc(db, zones, source);
      const row = aggregateEntry(zones);
      entries.push(row);
      okCount++;
      processed++;
      if (source === "dhan_equity") dhanOk++;
      else nseOk++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await stampEquityZonesError(db, symbol, error);
      processed++;
    }

    if (i < symbols.length - 1) {
      const gap = session && nseSession === "ok" ? delayMs : Math.max(delayMs, dhanDelayMs);
      const jitter = Math.round((Math.random() * 2 - 1) * 200);
      await sleep(Math.max(0, gap + jitter));
    }
  }

  await writeStockZoneAggregate(db, entries);

  if (fromQueue && processed > 0 && queueLength > 0) {
    await writeCursor(db, (startCursor + processed) % queueLength);
  }

  return {
    processed,
    ok: okCount,
    errors: processed - okCount,
    nseOk,
    dhanOk,
    timedOut,
    aborted,
    symbols,
    universeSize: FNO_UNIVERSE.length,
    cursorBefore: startCursor,
    queueMode,
    scannedInAggregate: scanned.size,
    backlogRemaining,
    queueLength,
    nseSession,
  };
}
