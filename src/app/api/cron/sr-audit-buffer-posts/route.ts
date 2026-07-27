/**
 * /api/cron/sr-audit-buffer-posts
 *
 * Auto-publish SR-audit win-story reels to Buffer (max 3/day, target 9 PM IST).
 *
 * Selection: realized move > 3%, oldest unposted first, never re-post a storyId
 * already in social_posts. Channel due-times are jittered; the video itself is
 * scheduled once.
 *
 * Two ticks on cron-job.org (recommended):
 *   GET ?key=CRON_SECRET&phase=prepare   → 19:00 IST (13:30 UTC) — pick stories + start renders
 *   GET ?key=CRON_SECRET&phase=publish   → 21:00 IST (15:30 UTC) — caption + schedule to Buffer
 *
 * Or a single daily call with phase=auto (prepare before 9 PM IST, publish at/after).
 *
 * Uses after() so cron-job.org's ~30s HTTP cap is fine; work continues in-process.
 */

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  listPostedToday,
  runSrAuditBufferAuto,
  type BufferAutoPhase,
} from "@/lib/sr-audit/auto-buffer-posts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

function parsePhase(raw: string | null): BufferAutoPhase {
  if (raw === "prepare" || raw === "publish" || raw === "auto") return raw;
  return "auto";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!CRON_SECRET || key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phase = parsePhase(searchParams.get("phase"));
  const dayKey = searchParams.get("day")?.trim() || undefined;
  const debug = searchParams.get("debug") === "1";

  // Read-only diagnostics — does not schedule or render.
  if (debug && searchParams.get("sync") !== "1" && !searchParams.get("phase")) {
    const db = getAdminFirestore();
    const keyDay =
      dayKey ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    const [posted, daySnap] = await Promise.all([
      listPostedToday(db, keyDay),
      db.collection("sr_audit_buffer_days").doc(keyDay).get(),
    ]);
    const autoPosted = posted.filter((p) => p.createdBy === "cron:sr-audit-buffer-posts");
    return NextResponse.json({
      success: true,
      mode: "debug",
      dayKey: keyDay,
      alreadyPostedToday: autoPosted.length,
      manualPostedToday: posted.length - autoPosted.length,
      posts: posted,
      dayDoc: daySnap.exists ? daySnap.data() : null,
    });
  }

  if (searchParams.get("sync") === "1") {
    try {
      const summary = await runSrAuditBufferAuto({ phase, dayKey });
      if (debug) {
        const db = getAdminFirestore();
        const posted = await listPostedToday(db, summary.dayKey);
        return NextResponse.json({
          success: true,
          mode: "sync",
          ...summary,
          debug: { posts: posted },
        });
      }
      return NextResponse.json({ success: true, mode: "sync", ...summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sr-audit-buffer-posts] sync", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  after(async () => {
    try {
      const summary = await runSrAuditBufferAuto({ phase, dayKey });
      console.log("[sr-audit-buffer-posts] done", JSON.stringify(summary));
    } catch (e) {
      console.error(
        "[sr-audit-buffer-posts] failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      phase,
      hint:
        "Batch runs after response. Use phase=prepare ~7 PM IST and phase=publish at 9 PM IST (max 3/day).",
    },
    { status: 202 },
  );
}
