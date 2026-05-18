import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { processCronTelegramAlerts } from "@/lib/cron-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/health-watchdog?key=CRON_SECRET
 *
 * Runs every 5 min on cron-job.org. Re-checks P0 cron heartbeats and
 * sends admin Telegram reminders while any job stays CRITICAL (even if
 * that job’s own cron stopped).
 */
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    await processCronTelegramAlerts(db);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
