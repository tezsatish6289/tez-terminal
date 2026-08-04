/**
 * /api/cron/today-board-buffer
 *
 * Morning FNO Ninja levels board → Buffer (X / FB / LinkedIn / IG).
 * Image = live /today OG card; captions link to https://fnoninja.com/today.
 *
 * cron-job.org (recommended):
 *   Mon–Fri 08:00 IST (= 02:30 UTC)
 *   GET https://<host>/api/cron/today-board-buffer?key=CRON_SECRET
 *
 * Optional:
 *   &force=1     — ignore weekday + 7–10 IST window (still one post/day)
 *   &sync=1      — run inline (for manual test; default uses after())
 *   &day=YYYY-MM-DD — override IST day key
 */

import { after, NextRequest, NextResponse } from "next/server";
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

  const run = () => runTodayBoardBufferAuto({ force, dayKey });

  if (sync) {
    try {
      const summary = await run();
      return NextResponse.json({ success: true, mode: "sync", ...summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[today-board-buffer] sync", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  after(async () => {
    try {
      const summary = await run();
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
      hint: "Posts after response. Schedule Mon–Fri 08:00 IST. Use sync=1&force=1 to test now.",
    },
    { status: 202 },
  );
}
