/**
 * Daily housekeeping cron.
 *
 * Owns once-per-day maintenance work that used to bloat `sync-live-trades`
 * every minute. By definition these scans only need to fire at UTC day
 * boundaries (stale daily-loss halts roll over at midnight UTC; legacy
 * kill-switch users only need a single re-enable pass once they're back on
 * an active deployment).
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
 *   1. `autoResumeStaleDailyLossHalts` — clear halt date + re-enable
 *      `autoTradeEnabled` for active deployments whose halt is now in the
 *      past (i.e. yesterday or earlier).
 *   2. `autoResumeLegacyKillSwitchUsers` — re-enable mirroring for active
 *      deployments where `autoTradeEnabled` was flipped off by the old
 *      kill-switch path and no halt is active today.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  autoResumeLegacyKillSwitchUsers,
  autoResumeStaleDailyLossHalts,
} from "@/lib/freedombot/auto-resume-mirroring";

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
    const legacyResumed = await autoResumeLegacyKillSwitchUsers(db);

    const durationMs = Date.now() - startedAt;
    if (staleHaltsCleared > 0 || legacyResumed > 0) {
      console.log(
        `[DailyHousekeeping] ${staleHaltsCleared} stale halt(s) cleared, ` +
          `${legacyResumed} legacy kill-switch user(s) re-enabled (${durationMs}ms)`,
      );
    } else {
      console.log(`[DailyHousekeeping] nothing to do (${durationMs}ms)`);
    }

    return NextResponse.json({
      success: true,
      staleHaltsCleared,
      legacyResumed,
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
