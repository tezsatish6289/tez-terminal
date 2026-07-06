/**
 * /api/cron/sr-audit-outcomes
 *
 * Scores open SR zone events using Dhan klines (incl. event-anchored PVT) until
 * invalidation or zone flip. The batch hits Dhan sequentially per open event, so
 * it routinely exceeds cron-job.org's 30s HTTP cap.
 *
 * Schedule: hourly on cron-job.org (GET + key). Like suggest-stock-zones, the
 * keyed GET returns 202 immediately and runs the batch in the background via
 * after() (up to maxDuration/timeoutSeconds = 120s), guarded by a run-lock so
 * hourly ticks can't overlap. cron-job.org reporting a 30s timeout is harmless —
 * the work still completes.
 *
 *   GET ?key=CRON_SECRET       → 202, batch runs in background
 *   GET ?key=…&sync=1          → waits for the full batch (debug; needs long timeout)
 */

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  releaseSrOutcomesRunLock,
  scoreOpenSrZoneEvents,
  tryAcquireSrOutcomesRunLock,
} from "@/lib/sr-audit/score-events";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyedCron = Boolean(CRON_SECRET && key === CRON_SECRET);
  const force = searchParams.get("force") === "1";
  if (!keyedCron && !force && !isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: "outside_market_hours",
      hint: "Add ?key=CRON_SECRET for scheduled runs outside 9–16 IST.",
    });
  }

  const db = getAdminFirestore();

  // Debug/manual: wait for the full batch (needs a client with a long timeout).
  if (searchParams.get("sync") === "1") {
    try {
      const summary = await scoreOpenSrZoneEvents(db);
      return NextResponse.json({ success: true, mode: "sync", ...summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sr-audit-outcomes] sync", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const acquired = await tryAcquireSrOutcomesRunLock(db);
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
      const summary = await scoreOpenSrZoneEvents(db);
      console.log("[sr-audit-outcomes] background batch done", JSON.stringify(summary));
    } catch (e) {
      console.error(
        "[sr-audit-outcomes] background batch failed:",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      await releaseSrOutcomesRunLock(db);
    }
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      hint: "Batch runs after response (for cron-job.org 30s limit). Check sr_audit_meta or the SR-audit page.",
    },
    { status: 202 },
  );
}
