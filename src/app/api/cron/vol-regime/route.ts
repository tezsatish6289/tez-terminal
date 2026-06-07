/**
 * /api/cron/vol-regime — ops + verification for the NSE volatility-regime data.
 *
 * Key-gated (CRON_SECRET), like the other cron/maintenance routes, so it's
 * triggerable from a script or cron-job.org without an admin session.
 *
 * Modes (GET):
 *   • (default)        → VERIFY: live-fetch NSE board meetings + India VIX and
 *                        report parsed counts + a small raw sample, plus what's
 *                        currently stored. Use this to confirm NSE field shapes
 *                        before relying on the daily cron.
 *   • ?backfillVix=1   → one-time seed of India VIX history from NSE so the
 *                        percentile is meaningful immediately (&days=365).
 *   • ?refresh=1       → run the same daily refresh as daily-housekeeping now
 *                        (earnings calendar + India VIX snapshot).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { createNseSession } from "@/lib/nse/client";
import {
  EARNINGS_CALENDAR_DOC,
  fetchBoardMeetings,
  parseEarningsFromBoardMeetings,
  refreshEarningsCalendar,
} from "@/lib/nse-earnings-calendar";
import {
  INDIA_VIX_DOC,
  backfillIndiaVix,
  fetchIndiaVix,
  loadIndiaVixState,
  refreshIndiaVix,
} from "@/lib/india-vix";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  let session;
  try {
    session = await createNseSession(db);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `NSE session failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  try {
    if (params.get("backfillVix") === "1") {
      const days = Math.min(2000, Math.max(30, Number(params.get("days") ?? 365) || 365));
      const result = await backfillIndiaVix(db, session, days);
      return NextResponse.json({ success: result.ok, mode: "backfillVix", days, result });
    }

    if (params.get("refresh") === "1") {
      const earnings = await refreshEarningsCalendar(db, session);
      const indiaVix = await refreshIndiaVix(db, session);
      return NextResponse.json({ success: true, mode: "refresh", earnings, indiaVix });
    }

    // VERIFY: live-fetch + parse, show a small raw sample + what's stored.
    const boardMeetings = await fetchBoardMeetings(session).catch((e) => {
      throw new Error(`board meetings: ${e instanceof Error ? e.message : String(e)}`);
    });
    const parsedEarnings = parseEarningsFromBoardMeetings(boardMeetings);
    const vixNow = await fetchIndiaVix(session).catch(() => null);

    const storedVix = await loadIndiaVixState(db);
    const earningsDoc = await db.doc(EARNINGS_CALENDAR_DOC).get();
    const vixDoc = await db.doc(INDIA_VIX_DOC).get();

    return NextResponse.json({
      success: true,
      mode: "verify",
      nse: {
        boardMeetings: {
          rawCount: boardMeetings.length,
          parsedResultsCount: Object.keys(parsedEarnings).length,
          rawSample: boardMeetings.slice(0, 3),
          parsedSample: Object.fromEntries(Object.entries(parsedEarnings).slice(0, 5)),
        },
        indiaVixNow: vixNow,
      },
      stored: {
        earnings: {
          count: earningsDoc.data()?.count ?? 0,
          updatedAt: earningsDoc.data()?.updatedAt ?? null,
        },
        indiaVix: {
          value: storedVix.value,
          percentile: storedVix.percentile,
          samples: Array.isArray(vixDoc.data()?.history) ? vixDoc.data()!.history.length : 0,
          updatedAt: vixDoc.data()?.updatedAt ?? null,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/vol-regime]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
