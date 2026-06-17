/**
 * /api/cron/suggest-stock-zones
 *
 * Sole cron for NSE F&O single-stock option zones and NSE index zones (Nifty,
 * Bank Nifty, …). Index refresh runs at the start of each tick when the oldest
 * index doc is stale (>14 min by default); stocks run in the same batch.
 *
 * Schedule: every 5 min on cron-job.org (GET + key). cron-job.org max HTTP timeout is 30s,
 * so keyed GET returns immediately and runs the batch in the background via after().
 *
 *   GET ?key=CRON_SECRET           → 202, work continues up to maxDuration (120s)
 *   GET ?key=…&sync=1              → waits for full batch (debug only; needs long timeout)
 *   POST                           → synchronous (UI refresh)
 */

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { recordCronHeartbeat } from "@/lib/cron-health";
import {
  releaseStockZonesRunLock,
  runStockZonesBatch,
  stockZonesHeartbeatFromSummary,
  tryAcquireStockZonesRunLock,
} from "@/lib/stock-zones-runner";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";
import {
  maybeRefreshIndexZonesIfStale,
  summarizeIndexZones,
  type IndexZonesRefreshResult,
} from "@/lib/index-zones-store";

export const dynamic = "force-dynamic";
/** Background batch after() may run up to platform limit (apphosting timeoutSeconds). */
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

async function recordStockZonesHeartbeat(
  result: Parameters<typeof recordCronHeartbeat>[2],
): Promise<void> {
  try {
    await recordCronHeartbeat(getAdminFirestore(), "suggest-stock-zones", result);
  } catch {
    /* heartbeat must not break cron */
  }
}

function indexZonesSummarySuffix(
  ix: IndexZonesRefreshResult | { skipped: string } | undefined,
): string {
  if (!ix) return "";
  if ("skipped" in ix) return ` indices=${ix.skipped}`;
  return ` ${summarizeIndexZones(ix)}`;
}

/** NSE index zones — runs before stock batch when stale during market hours. */
async function refreshIndexZonesIfNeeded(
  db: ReturnType<typeof getAdminFirestore>,
  force = false,
): Promise<IndexZonesRefreshResult | { skipped: string } | undefined> {
  if (!isNiftyOptionChainCronWindow()) {
    return { skipped: "outside_market_hours" };
  }
  try {
    return await maybeRefreshIndexZonesIfStale(db, { force });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[SuggestStockZones] index zones pass failed (isolated):", msg);
    return { skipped: `error:${msg.slice(0, 80)}` };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyedCron = Boolean(CRON_SECRET && key === CRON_SECRET);
  if (!keyedCron && !isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: "outside_market_hours",
      processed: 0,
      ok: 0,
      hint: "Add ?key=CRON_SECRET so scheduled crons scan stocks outside 9–16 IST.",
    });
  }

  const sync = searchParams.get("sync") === "1";

  if (sync) {
    const startedAt = Date.now();
    const db = getAdminFirestore();
    try {
      const indexZones = await refreshIndexZonesIfNeeded(db);
      const summary = await runStockZonesBatch(db);
      const base = stockZonesHeartbeatFromSummary(summary, Date.now() - startedAt);
      await recordStockZonesHeartbeat({
        ...base,
        summary: (base.summary ?? "") + indexZonesSummarySuffix(indexZones),
      });
      return NextResponse.json({ success: true, mode: "sync", indexZones, ...summary });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SuggestStockZones] sync failed:", err);
      await recordStockZonesHeartbeat({
        ok: false,
        error: msg,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const db = getAdminFirestore();
  const acquired = await tryAcquireStockZonesRunLock(db);
  if (!acquired) {
    console.warn(
      "[SuggestStockZones] skipped tick — previous background batch still holds run lock",
    );
    await recordStockZonesHeartbeat({
      ok: true,
      degraded: true,
      summary: "skipped: already_running",
      durationMs: 0,
    });
    return NextResponse.json({
      success: true,
      accepted: false,
      skipped: "already_running",
      hint: "Previous background batch still in progress. cron-job.org 30s timeout is OK — wait for next tick.",
    });
  }

  after(async () => {
    const startedAt = Date.now();
    try {
      const indexZones = await refreshIndexZonesIfNeeded(db);
      const summary = await runStockZonesBatch(db);
      console.log("[SuggestStockZones] background batch done", JSON.stringify(summary));
      const base = stockZonesHeartbeatFromSummary(summary, Date.now() - startedAt);
      await recordStockZonesHeartbeat({
        ...base,
        summary: (base.summary ?? "") + indexZonesSummarySuffix(indexZones),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SuggestStockZones] background batch failed:", err);
      await recordStockZonesHeartbeat({
        ok: false,
        error: msg,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      await releaseStockZonesRunLock(db);
    }
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      hint: "Batch runs after response (for cron-job.org 30s limit). Check cron_health/suggest-stock-zones or zone_status_stocks.",
    },
    { status: 202 },
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const db = getAdminFirestore();
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
    const indexZones = await refreshIndexZonesIfNeeded(db, true);
    const summary = await runStockZonesBatch(db, { symbolsOverride });
    const base = stockZonesHeartbeatFromSummary(summary, Date.now() - startedAt);
    await recordStockZonesHeartbeat({
      ...base,
      summary: (base.summary ?? "") + indexZonesSummarySuffix(indexZones),
    });
    return NextResponse.json({ success: true, indexZones, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Manual failed:", err);
    await recordStockZonesHeartbeat({
      ok: false,
      error: msg,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
