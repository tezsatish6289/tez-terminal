/**
 * Daily housekeeping cron.
 *
 * Owns once-per-day maintenance work that used to bloat `sync-live-trades`
 * every minute. By definition these scans only need to fire at UTC day
 * boundaries (stale daily-loss halts roll over at midnight UTC).
 *
 * Recommended cadence: once daily at 00:05 UTC via cron-job.org.
 *
 * cron-job.org max HTTP timeout is 30s. Fast work (halts, earnings, VIX) runs
 * inline; the F&O universe pipeline (Dhan validation ~60s) runs in after().
 * Use ?sync=1 only for manual debugging with a long client timeout.
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
 *   2. F&O universe pipeline — sync NSE/Dhan symbol list, Dhan securityId map,
 *      and rotate option-chain validation (~20 symbols/day).
 *
 * Note: `autoResumeLegacyKillSwitchUsers` was removed 2026-05-23 along with
 * the legacy `/api/settings/kill-switch` route. The kill switch is now
 * strictly trade-level (close one sim + cascade live mirrors) and never
 * disables a user's bot, so there's no orphaned `autoTradeEnabled: false`
 * state left to recover from.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { autoResumeStaleDailyLossHalts } from "@/lib/freedombot/auto-resume-mirroring";
import { createNseSession } from "@/lib/nse/client";
import { refreshEarningsCalendar } from "@/lib/nse-earnings-calendar";
import { refreshIndiaVix } from "@/lib/india-vix";
import {
  runFnoUniversePipeline,
  summarizeFnoUniversePipeline,
} from "@/lib/fno-universe-pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Background F&O pipeline (after()) may run up to platform limit. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;
  const sync = searchParams.get("sync") === "1";

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

    // Refresh the NSE results (earnings) calendar + India VIX snapshot once a
    // day, reusing one NSE session. Best-effort: an NSE block / failure must not
    // fail housekeeping, so we swallow + report each.
    let earnings: { ok: boolean; count: number; error?: string } = {
      ok: false,
      count: 0,
      error: "not_attempted",
    };
    let indiaVix: { ok: boolean; value: number | null; percentile: number | null; error?: string } = {
      ok: false,
      value: null,
      percentile: null,
      error: "not_attempted",
    };
    let nseSession = null;
    try {
      nseSession = await createNseSession(db);
      earnings = await refreshEarningsCalendar(db, nseSession);
      const vix = await refreshIndiaVix(db, nseSession);
      indiaVix = { ok: vix.ok, value: vix.value, percentile: vix.percentile, error: vix.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (earnings.error === "not_attempted") earnings = { ok: false, count: 0, error };
      indiaVix = { ok: false, value: null, percentile: null, error };
    }

    if (sync) {
      let fnoPipeline: { ok: boolean; summary: string; error?: string } = {
        ok: false,
        summary: "not_attempted",
      };
      try {
        const pipeline = await runFnoUniversePipeline(db, {
          validateLimit: 20,
          session: nseSession,
        });
        fnoPipeline = { ok: true, summary: summarizeFnoUniversePipeline(pipeline) };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        fnoPipeline = { ok: false, summary: "failed", error };
      }
      const durationMs = Date.now() - startedAt;
      console.log(
        `[DailyHousekeeping] sync mode stale=${staleHaltsCleared}; F&O: ${fnoPipeline.summary} (${durationMs}ms)`,
      );
      return NextResponse.json({
        success: true,
        mode: "sync",
        staleHaltsCleared,
        earnings,
        indiaVix,
        fnoPipeline,
        durationMs,
      });
    }

    after(async () => {
      try {
        const pipeline = await runFnoUniversePipeline(db, {
          validateLimit: 20,
          session: nseSession,
        });
        console.log(
          `[DailyHousekeeping] F&O pipeline background done: ${summarizeFnoUniversePipeline(pipeline)}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[DailyHousekeeping] F&O pipeline background failed:", msg);
      }
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[DailyHousekeeping] stale halts cleared: ${staleHaltsCleared}; earnings: ${
        earnings.ok ? `${earnings.count} symbols` : `failed (${earnings.error})`
      }; India VIX: ${
        indiaVix.ok ? `${indiaVix.value} (pctl ${indiaVix.percentile ?? "n/a"})` : `failed (${indiaVix.error})`
      }; F&O pipeline: accepted (background) (${durationMs}ms)`,
    );

    return NextResponse.json({
      success: true,
      staleHaltsCleared,
      earnings,
      indiaVix,
      fnoPipeline: {
        accepted: true,
        mode: "background",
        hint: "Universe + Dhan map + validation run after response (cron-job.org 30s limit).",
      },
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
