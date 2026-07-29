/**
 * /api/cron/score-alerts
 *
 * Evaluates light Atlas scores for users with score alerts enabled and their
 * favslide symbols. Fires on threshold cross (60 / 70 / 80) → Firestore inbox
 * + RTDB live fanout.
 *
 *   GET ?key=CRON_SECRET
 *   GET ?key=CRON_SECRET&force=1  — ignore market-hours window
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { evaluateScoreAlerts } from "@/lib/alerts/evaluate-score-alerts";
import { isNiftyOptionChainCronWindow } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = params.get("force") === "1";
  if (!force && !isNiftyOptionChainCronWindow()) {
    return NextResponse.json({
      success: true,
      skipped: "outside_market_window",
      hint: "Mon–Fri 9:00–16:00 IST, or pass force=1",
    });
  }

  try {
    const result = await evaluateScoreAlerts(getAdminFirestore());
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[cron/score-alerts]", e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
