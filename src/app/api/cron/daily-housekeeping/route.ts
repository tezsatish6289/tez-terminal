/**
 * Daily housekeeping cron.
 *
 * Owns once-per-day maintenance work that used to bloat `sync-live-trades`
 * every minute. By definition these scans only need to fire at UTC day
 * boundaries (stale daily-loss halts roll over at midnight UTC).
 *
 * Recommended cadence: once daily at 00:05 UTC via cron-job.org.
 *
 * Not part of the P0 trading chain — if this misses a day, users with a
 * stale halt simply wait an extra cycle, and they can still flip it via the
 * admin "force resume" path. We deliberately don't wire this into
 * `recordCronHeartbeat` / Telegram alerts to avoid noisy 5-minute reminders
 * for a job that runs every 24 hours.
 *
 * Responsibilities:
 *   1. `autoResumeStaleDailyLossHalts` — clear `dailyLossHaltedUtcDate` for
 *      active deployments whose halt date is now in the past. Does NOT
 *      touch `autoTradeEnabled` — crons must never override an explicit
 *      user pause/stop decision.
 *
 * Note: `autoResumeLegacyKillSwitchUsers` was removed 2026-05-23 along with
 * the legacy `/api/settings/kill-switch` route. The kill switch is now
 * strictly trade-level (close one sim + cascade live mirrors) and never
 * disables a user's bot, so there's no orphaned `autoTradeEnabled: false`
 * state left to recover from.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { autoResumeStaleDailyLossHalts } from "@/lib/freedombot/auto-resume-mirroring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const db = getAdminFirestore();
  const startedAt = Date.now();

  try {
    const staleHaltsCleared = await autoResumeStaleDailyLossHalts(db);

    const durationMs = Date.now() - startedAt;
    if (staleHaltsCleared > 0) {
      console.log(
        `[DailyHousekeeping] ${staleHaltsCleared} stale halt(s) cleared (${durationMs}ms)`,
      );
    } else {
      console.log(`[DailyHousekeeping] nothing to do (${durationMs}ms)`);
    }

    return NextResponse.json({
      success: true,
      staleHaltsCleared,
      durationMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DailyHousekeeping] FAILED:", msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
