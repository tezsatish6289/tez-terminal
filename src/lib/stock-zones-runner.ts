/**
 * F&O stock zone batch for `/api/cron/suggest-stock-zones` only.
 *
 * Scheduling (`nextStockZonesBatch` in fno-universe.ts):
 *   • Universe: Firestore `config/fno_universe` (Tier B first), seed fallback.
 *   • Cursor: `config/stock_zones_cursor.index`.
 *   • Backlog: symbols not in `zone_status_stocks.entries`.
 *   • Refresh: all scanned → oldest `computedAt` first.
 *
 * Fetch: NSE option chain per symbol; on block/circuit failure → Dhan fallback.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { NseSession } from "@/lib/nse/client";
import { createNseSession } from "@/lib/nse/client";
import { isNseCircuitClosed } from "@/lib/nse/circuit-breaker";
import { NseCircuitOpenError } from "@/lib/nse/types";
import { computeStockZonesWithFallback, nseFallbackEligible } from "@/lib/equity-zones-fetch";
import {
  nextStockZonesBatch,
  buildRefreshQueue,
  type StockAggregateMeta,
} from "@/lib/nse/fno-universe";
import { loadFnoUniverse } from "@/lib/nse/fno-universe-runtime";
import { resolveDhanEquitySecurityId } from "@/lib/dhan-candles";
import {
  isDhanOptionChainBlocked,
  loadDhanFnoEntries,
} from "@/lib/dhan-instruments-sync";
import {
  persistEquityZonesDoc,
  pruneStaleStockZones,
  stampEquityZonesError,
  stockDocId,
  writeStockZoneAggregate,
  aggregateEntry,
  type StockZoneAggregateEntry,
} from "@/lib/equity-zones-store";
import { maybeRecordSrZoneEvent } from "@/lib/sr-audit/record-event";
import { loadEarningsCalendar } from "@/lib/nse-earnings-calendar";
import { daysUntil } from "@/lib/zones/vol-regime";
import { loadIndiaVixState } from "@/lib/india-vix";
import { loadIvHistory, recordDailyAtmIv } from "@/lib/iv-history";

const CURSOR_DOC = "config/stock_zones_cursor";
const AGGREGATE_DOC = "config/zone_status_stocks";
const RUN_LOCK_DOC = "config/stock_zones_run_lock";

/** Prevent overlapping background batches when cron fires every 5 min. */
export async function tryAcquireStockZonesRunLock(
  db: Firestore,
  ttlMs = 100_000,
): Promise<boolean> {
  const ref = db.doc(RUN_LOCK_DOC);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const untilMs = snap.exists
      ? new Date(String((snap.data() as { until?: string }).until ?? 0)).getTime()
      : 0;
    if (untilMs > now) return false;
    tx.set(ref, {
      until: new Date(now + ttlMs).toISOString(),
      startedAt: new Date(now).toISOString(),
    });
    return true;
  });
}

export async function releaseStockZonesRunLock(db: Firestore): Promise<void> {
  try {
    await db.doc(RUN_LOCK_DOC).delete();
  } catch {
    /* best-effort */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DHAN_SKIP_ERROR_RE = /invalid securityid|unknown_symbol/i;

function isDhanFetchError(msg: string): boolean {
  return DHAN_SKIP_ERROR_RE.test(msg);
}

async function isDhanBlockedSymbol(
  db: Firestore,
  symbol: string,
): Promise<boolean> {
  try {
    const snap = await db.doc(stockDocId(symbol)).get();
    const err = snap.data()?.nseFetchError;
    return typeof err === "string" && isDhanFetchError(err);
  } catch {
    return false;
  }
}

/**
 * When NSE circuit is open the cron is Dhan-only. Backlog symbols often have stale
 * or missing Dhan security IDs — always refresh already-scanned names instead.
 */
async function pickDhanOnlyBatch(
  db: Firestore,
  universe: readonly string[],
  startCursor: number,
  batchSize: number,
  bySymbol: ReadonlyMap<string, StockAggregateMeta>,
  prevEntries: Record<string, StockZoneAggregateEntry>,
): Promise<{ symbols: string[]; queueMode: "refresh"; queueLength: number }> {
  const refreshQueue = buildRefreshQueue(universe, bySymbol);
  const n = refreshQueue.length;
  if (n === 0) return { symbols: [], queueMode: "refresh", queueLength: 0 };

  const fnoEntries = await loadDhanFnoEntries(db);
  const dhanFirst = refreshQueue.filter((s) => prevEntries[s]?.levelsSource === "dhan");
  const other = refreshQueue.filter((s) => prevEntries[s]?.levelsSource !== "dhan");
  const ordered = [...dhanFirst, ...other];

  const start = ((startCursor % n) + n) % n;
  const picked: string[] = [];
  for (let i = 0; i < ordered.length && picked.length < batchSize; i++) {
    const sym = ordered[(start + i) % ordered.length]!;
    if (isDhanOptionChainBlocked(sym, fnoEntries)) continue;
    if ((await resolveDhanEquitySecurityId(sym)) == null) continue;
    if (await isDhanBlockedSymbol(db, sym)) continue;
    picked.push(sym);
  }
  return { symbols: picked, queueMode: "refresh", queueLength: n };
}

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

async function readAggregateState(db: Firestore): Promise<{
  scanned: Set<string>;
  bySymbol: Map<string, StockAggregateMeta>;
  entries: Record<string, StockZoneAggregateEntry>;
}> {
  const scanned = new Set<string>();
  const bySymbol = new Map<string, StockAggregateMeta>();
  const entries: Record<string, StockZoneAggregateEntry> = {};
  try {
    const snap = await db.doc(AGGREGATE_DOC).get();
    const raw = (snap.data()?.entries ?? {}) as Record<
      string,
      StockZoneAggregateEntry | undefined
    >;
    for (const [sym, row] of Object.entries(raw)) {
      if (!row) continue;
      scanned.add(sym);
      entries[sym] = row;
      bySymbol.set(sym, {
        computedAt: typeof row.computedAt === "string" ? row.computedAt : null,
      });
    }
  } catch {
    /* empty */
  }
  return { scanned, bySymbol, entries };
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
  const batchSize = opts.batchSize ?? envNum("STOCK_ZONES_BATCH_SIZE", 3);
  const delayMs = opts.delayMs ?? envNum("STOCK_ZONES_DELAY_MS", 600);
  const dhanDelayMs = envNum("STOCK_ZONES_DHAN_DELAY_MS", 400);
  const maxWallClockMs = opts.maxWallClockMs ?? envNum("STOCK_ZONES_MAX_RUN_MS", 95_000);
  const perSymbolMs = envNum("STOCK_ZONES_SYMBOL_TIMEOUT_MS", 40_000);

  const fromQueue = !(opts.symbolsOverride && opts.symbolsOverride.length);
  const startCursor = fromQueue ? await readCursor(db) : 0;
  const fnoUniverse = await loadFnoUniverse(db);
  const { scanned, bySymbol, entries: prevEntries } = fromQueue
    ? await readAggregateState(db)
    : {
        scanned: new Set<string>(),
        bySymbol: new Map<string, StockAggregateMeta>(),
        entries: {} as Record<string, StockZoneAggregateEntry>,
      };

  let symbols: string[] = [];
  let queueMode: "backlog" | "refresh" = "refresh";
  let queueLength = fnoUniverse.length;

  if (!fromQueue) {
    symbols = opts.symbolsOverride!.filter((s) => fnoUniverse.includes(s));
  } else {
    const picked = nextStockZonesBatch(fnoUniverse, startCursor, batchSize, scanned, bySymbol);
    symbols = picked.symbols;
    queueMode = picked.mode;
    queueLength = picked.queueLength;
  }

  const backlogRemaining = fnoUniverse.filter((s) => !scanned.has(s)).length;

  const emptySummary = (): StockZonesBatchSummary => ({
    processed: 0,
    ok: 0,
    errors: 0,
    nseOk: 0,
    dhanOk: 0,
    timedOut: false,
    aborted: null,
    symbols: [],
    universeSize: fnoUniverse.length,
    cursorBefore: startCursor,
    queueMode,
    scannedInAggregate: scanned.size,
    backlogRemaining,
    queueLength,
    nseSession: "failed",
  });

  if (!symbols.length) return emptySummary();

  const nseAllowed = await isNseCircuitClosed(db);
  let session: NseSession | null = null;
  let nseSession: StockZonesBatchSummary["nseSession"] = "ok";
  let dhanOnly = !nseAllowed;
  if (dhanOnly) {
    nseSession = "circuit_open";
  } else {
    try {
      session = await createNseSession(db);
    } catch (e) {
      if (e instanceof NseCircuitOpenError) nseSession = "circuit_open";
      else nseSession = "failed";
      session = null;
      dhanOnly = true;
    }
  }

  // NSE circuit open → Dhan-only. Never dequeue backlog (stale/missing security IDs).
  if (dhanOnly && fromQueue) {
    const picked = await pickDhanOnlyBatch(db, fnoUniverse, startCursor, batchSize, bySymbol, prevEntries);
    symbols = picked.symbols;
    queueMode = picked.queueMode;
    queueLength = picked.queueLength;
  }

  if (!symbols.length) return emptySummary();

  // Volatility-regime context loaded once for the batch:
  //   • earnings calendar (symbol → ISO results date)
  //   • India VIX percentile (market backdrop)
  //   • cross-sectional cohort of peer ATM IVs (cold-start percentile fallback)
  const earningsCalendar = await loadEarningsCalendar(db);
  const vix = await loadIndiaVixState(db);
  const cohortIvs = Object.values(prevEntries)
    .map((e) => e?.atmIV)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const startedAt = Date.now();
  const entries: StockZoneAggregateEntry[] = [];
  let processed = 0;
  let okCount = 0;
  let nseOk = 0;
  let dhanOk = 0;
  let timedOut = false;
  let aborted: string | null = null;
  const symbolTimeoutMs = dhanOnly ? Math.min(perSymbolMs, 28_000) : perSymbolMs;

  const fetchOne = async (symbol: string, useSession: NseSession | null) => {
    const daysToEarnings = daysUntil(earningsCalendar[symbol], Date.now());
    const ivHist = await loadIvHistory(db, symbol);
    const { primary, byExpiry, source } = await Promise.race([
      computeStockZonesWithFallback(symbol, useSession, {
        daysToEarnings,
        ivHistory: ivHist.values,
        crossSectionalIvs: cohortIvs,
        vixPercentile: vix.percentile,
      }),
      sleep(symbolTimeoutMs).then(() => {
        throw new Error(`symbol_timeout_${symbolTimeoutMs}ms`);
      }),
    ]);
    await persistEquityZonesDoc(db, primary, source, byExpiry);
    await recordDailyAtmIv(db, symbol, primary.atmIV, ivHist);
    const row = aggregateEntry(primary, source);
    await maybeRecordSrZoneEvent(db, primary, source, prevEntries[symbol]);
    entries.push(row);
    okCount++;
    processed++;
    if (source === "dhan_equity") dhanOk++;
    else nseOk++;
  };

  const refreshOverflow =
    dhanOnly && fromQueue && queueLength > 0
      ? (
          await pickDhanOnlyBatch(db, fnoUniverse, startCursor + batchSize, batchSize * 4, bySymbol, prevEntries)
        ).symbols.filter((s) => !symbols.includes(s))
      : [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    if (i > 0 && Date.now() - startedAt > maxWallClockMs) {
      timedOut = true;
      break;
    }

    let done = false;
    try {
      await fetchOne(symbol, dhanOnly ? null : session);
      done = true;
    } catch (e) {
      if (!dhanOnly && nseFallbackEligible(e)) {
        dhanOnly = true;
        nseSession = "circuit_open";
        try {
          await fetchOne(symbol, null);
          done = true;
        } catch (retryErr) {
          const error = retryErr instanceof Error ? retryErr.message : String(retryErr);
          await stampEquityZonesError(db, symbol, error);
        }
      } else {
        const error = e instanceof Error ? e.message : String(e);
        await stampEquityZonesError(db, symbol, error);
        if (dhanOnly && isDhanFetchError(error) && refreshOverflow.length > 0) {
          const next = refreshOverflow.shift()!;
          try {
            await fetchOne(next, null);
            done = true;
          } catch (overflowErr) {
            const overflowMsg =
              overflowErr instanceof Error ? overflowErr.message : String(overflowErr);
            await stampEquityZonesError(db, next, overflowMsg);
          }
        }
      }
    }
    if (!done) processed++;

    if (i < symbols.length - 1) {
      const gap = dhanOnly ? Math.max(delayMs, dhanDelayMs) : delayMs;
      const jitter = Math.round((Math.random() * 2 - 1) * 200);
      await sleep(Math.max(0, gap + jitter));
    }
  }

  await writeStockZoneAggregate(db, entries);

  // Self-healing: drop aggregate/per-symbol docs for names that left the F&O
  // universe. Guarded by a non-empty universe so a failed load can't wipe it.
  if (fnoUniverse.length > 0) {
    try {
      const pruned = await pruneStaleStockZones(db, fnoUniverse);
      if (pruned.length) {
        console.log(`[stock-zones] pruned ${pruned.length} stale symbol(s): ${pruned.join(", ")}`);
      }
    } catch (e) {
      console.error("[stock-zones] prune failed:", e instanceof Error ? e.message : e);
    }
  }

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
    universeSize: fnoUniverse.length,
    cursorBefore: startCursor,
    queueMode,
    scannedInAggregate: scanned.size,
    backlogRemaining,
    queueLength,
    nseSession,
  };
}

/** One-line summary for cron heartbeat + logs. */
export function summarizeStockZonesBatch(s: StockZonesBatchSummary): string {
  const parts = [
    `ok=${s.ok}/${s.processed}`,
    `err=${s.errors}`,
    `nse=${s.nseOk}`,
    `dhan=${s.dhanOk}`,
    `mode=${s.queueMode}`,
  ];
  if (s.timedOut) parts.push("timedOut");
  if (s.nseSession !== "ok") parts.push(`nseSession=${s.nseSession}`);
  if (s.symbols.length) parts.push(`syms=${s.symbols.join(",")}`);
  return parts.join(" ");
}

export function stockZonesHeartbeatFromSummary(
  s: StockZonesBatchSummary,
  durationMs: number,
): {
  ok: boolean;
  degraded?: boolean;
  summary?: string;
  durationMs: number;
  error?: string;
} {
  const summary = summarizeStockZonesBatch(s);
  if (s.processed === 0 && s.symbols.length === 0) {
    return { ok: true, summary: "no symbols dequeued", durationMs };
  }
  const ok = s.ok > 0;
  return {
    ok,
    degraded: ok && s.errors > 0,
    summary,
    durationMs,
    error: ok ? undefined : `0/${s.processed} symbols succeeded`,
  };
}
