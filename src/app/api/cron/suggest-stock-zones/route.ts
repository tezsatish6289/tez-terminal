/**
 * /api/cron/suggest-stock-zones
 *
 * Sole cron for NSE F&O single-stock option zones (no piggyback on suggest-zones).
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
import {
  releaseStockZonesRunLock,
  runStockZonesBatch,
  tryAcquireStockZonesRunLock,
} from "@/lib/stock-zones-runner";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
/** Background batch after() may run up to platform limit (apphosting timeoutSeconds). */
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

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
    try {
      const summary = await runStockZonesBatch(getAdminFirestore());
      return NextResponse.json({ success: true, mode: "sync", ...summary });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SuggestStockZones] sync failed:", err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const db = getAdminFirestore();
  const acquired = await tryAcquireStockZonesRunLock(db);
  if (!acquired) {
    return NextResponse.json({
      success: true,
      accepted: false,
      skipped: "already_running",
      hint: "Previous background batch still in progress. cron-job.org 30s timeout is OK — wait for next tick.",
    });
  }

  after(async () => {
    try {
      const summary = await runStockZonesBatch(db);
      console.log("[SuggestStockZones] background batch done", JSON.stringify(summary));
    } catch (err) {
      console.error("[SuggestStockZones] background batch failed:", err);
    } finally {
      await releaseStockZonesRunLock(db);
    }
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      hint: "Batch runs after response (for cron-job.org 30s limit). Check logs or Firestore zone_status_stocks.",
    },
    { status: 202 },
  );
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
    const summary = await runStockZonesBatch(getAdminFirestore(), { symbolsOverride });
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SuggestStockZones] Manual failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
