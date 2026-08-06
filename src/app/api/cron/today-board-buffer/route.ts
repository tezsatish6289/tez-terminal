/**
 * /api/cron/today-board-buffer
 *
 * Morning FNO Ninja social posts → Buffer (X / FB / LinkedIn / IG):
 *   1) Levels board image → https://fnoninja.com/today  (publish now)
 *   2) Bubbles map summary → https://fnoninja.com/levels  (~15 min later)
 *
 * cron-job.org (recommended):
 *   Mon–Fri 08:00 IST (= 02:30 UTC)
 *   GET https://<host>/api/cron/today-board-buffer?key=CRON_SECRET
 *
 * Optional:
 *   &force=1     — ignore weekday + 7–10 IST window (still one post/day each)
 *   &sync=1      — run inline (for manual test; default uses after())
 *   &day=YYYY-MM-DD — override IST day key
 */

import { after, NextRequest, NextResponse } from "next/server";
import { runBubblesBoardBufferAuto } from "@/lib/fnoninja/bubbles-board-buffer";
import { runTodayBoardBufferAuto } from "@/lib/fnoninja/today-board-buffer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!CRON_SECRET || key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = searchParams.get("force") === "1";
  const dayKey = searchParams.get("day")?.trim() || undefined;
  const sync = searchParams.get("sync") === "1";
  const opts = { force, dayKey };

  const runBoth = async () => {
    const todayBoard = await runTodayBoardBufferAuto(opts).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[today-board-buffer] failed:", msg);
      return { error: msg } as const;
    });
    const bubblesBoard = await runBubblesBoardBufferAuto(opts).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bubbles-board-buffer] failed:", msg);
      return { error: msg } as const;
    });
    return { todayBoard, bubblesBoard };
  };

  if (sync) {
    try {
      const summary = await runBoth();
      return NextResponse.json({ success: true, mode: "sync", ...summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[today-board-buffer] sync", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  after(async () => {
    try {
      const summary = await runBoth();
      console.log("[today-board-buffer] done", JSON.stringify(summary));
    } catch (e) {
      console.error(
        "[today-board-buffer] failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      hint: "Posts after response: /today now, /levels ~15m later. Schedule Mon–Fri 08:00 IST. Use sync=1&force=1 to test now.",
    },
    { status: 202 },
  );
}
