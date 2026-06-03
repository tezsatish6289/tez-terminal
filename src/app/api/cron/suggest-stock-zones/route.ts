/**
 * /api/cron/suggest-stock-zones
 *
 * Dedicated, ISOLATED cron for NSE single-stock (equity) option zones. It is a
 * brand-new route that the crypto / index zone pipeline does not import or
 * depend on, so it can never affect those flows — the crypto bot setup is safe.
 *
 * Safety model (all via the shared NSE client):
 *   • Circuit breaker  — refuses to call NSE while a block window is active.
 *   • Rate limiter      — token bucket caps burst + sustained request rate.
 *   • Serial batch      — `runNseBatch` walks symbols one at a time with jitter
 *                         and aborts the rest of the run on a confirmed block.
 *   • Round-robin queue — each run refreshes a slice of the F&O universe (hot
 *                         Tier-B names first), advancing a persisted cursor.
 *   • Market-hours gate — GET skips outside NSE hours; POST always runs (manual).
 *
 * Schedule it on your external cron (e.g. every 5–15 min). Tune batch size to fit
 * the deploy platform's function timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
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
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const CURSOR_DOC = "config/stock_zones_cursor";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function readCursor(db: ReturnType<typeof getAdminFirestore>): Promise<number> {
  try {
    const snap = await db.doc(CURSOR_DOC).get();
    const v = snap.exists ? (snap.data() as { index?: number }).index : 0;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

async function writeCursor(db: ReturnType<typeof getAdminFirestore>, index: number): Promise<void> {
  try {
    await db.doc(CURSOR_DOC).set({ index, updatedAt: new Date().toISOString() }, { merge: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Run one batch. `symbolsOverride` (manual POST) bypasses the round-robin queue.
 */
async function run(symbolsOverride?: string[]) {
  const db = getAdminFirestore();
  const batchSize = envNum("STOCK_ZONES_BATCH_SIZE", 32);
  const delayMs = envNum("STOCK_ZONES_DELAY_MS", 1_000);
  const maxWallClockMs = envNum("STOCK_ZONES_MAX_RUN_MS", 50_000);

  const fromQueue = !(symbolsOverride && symbolsOverride.length);
  const startCursor = fromQueue ? await readCursor(db) : 0;

  let symbols: string[];
  if (!fromQueue) {
    symbols = symbolsOverride!.filter((s) => FNO_UNIVERSE.includes(s));
  } else {
    symbols = nextBatch(startCursor, batchSize).symbols;
  }

  if (!symbols.length) {
    return { processed: 0, ok: 0, errors: 0, timedOut: false, aborted: null as string | null, symbols: [] };
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

  // Advance the queue by exactly the number of symbols genuinely handled, so the
  // next run resumes where this one stopped (time-budget or block both leave a
  // correct resume point — no gaps, no duplicate work).
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
  };
}

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNiftyOptionChainCronWindow()) {
    return NextResponse.json({ success: true, skipped: "outside_market_hours" });
  }
  try {
    const summary = await run();
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let symbolsOverride: string[] | undefined;
    try {
      const body = (await request.json()) as { symbols?: string[] };
      if (Array.isArray(body?.symbols)) {
        symbolsOverride = body.symbols.map((s) => String(s).toUpperCase());
      }
    } catch {
      /* no body — full queue batch */
    }
    const summary = await run(symbolsOverride);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Manual failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
