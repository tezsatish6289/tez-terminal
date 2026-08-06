/**
 * Automate the morning FNO Ninja bubbles-map Buffer post (image + /levels link).
 *
 * Runs from the same cron as today-board-buffer:
 *   GET /api/cron/today-board-buffer?key=CRON_SECRET
 *
 * Idempotent: at most one auto post per IST calendar day (source=bubbles-board).
 * Publishes ~15 minutes after the levels-today card so feeds aren’t a double-hit.
 */

import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import {
  bubblesBoardHasSignal,
  loadBubblesBoard,
} from "@/lib/fnoninja/bubbles-board";
import { buildBubblesBoardCaptions } from "@/lib/fnoninja/bubbles-board-captions";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  istDayKey,
  istHour,
  isIstWeekday,
  TODAY_BUFFER_HOUR_WINDOW,
  TODAY_BUFFER_PLATFORMS,
} from "@/lib/fnoninja/today-board-buffer";
import {
  getPostedContentMap,
  scheduleToBuffer,
  type ChannelResult,
  type ScheduleResult,
} from "@/lib/social/schedule";

export const BUBBLES_BUFFER_SOURCE = "bubbles-board";
export const BUBBLES_BUFFER_CREATED_BY = "cron:today-board-buffer";
/** Minutes after cron tick to publish via Buffer schedule. */
export const BUBBLES_BUFFER_DELAY_MINUTES = 15;

const DAY_LOCK_COLLECTION = "bubbles_board_buffer_days";

export type BubblesBoardBufferSummary = {
  dayKey: string;
  skipped: string | null;
  status: ScheduleResult["status"] | "skipped";
  contentId: string;
  imageUrl: string | null;
  scheduleId: string | null;
  results: ChannelResult[];
};

function ogImageUrl(dayKey: string): string {
  return `${FNONINJA_SITE_URL}/levels/opengraph-image?d=${encodeURIComponent(dayKey)}`;
}

function contentIdForDay(dayKey: string): string {
  return `bubbles-board-${dayKey}`;
}

async function claimDayLock(dayKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getAdminFirestore();
  const ref = db.collection(DAY_LOCK_COLLECTION).doc(dayKey);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const status = snap.exists ? String(snap.data()?.status ?? "") : "";
      if (status === "posted" || status === "posting") {
        throw new Error(status === "posted" ? "already_posted_lock" : "in_progress");
      }
      tx.set(
        ref,
        {
          status: "posting",
          claimedAt: new Date().toISOString(),
          claimedBy: BUBBLES_BUFFER_CREATED_BY,
        },
        { merge: true },
      );
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "already_posted_lock") return { ok: false, reason: "Already posted today (lock)" };
    if (msg === "in_progress") return { ok: false, reason: "Post already in progress for today" };
    throw e;
  }
}

async function finishDayLock(
  dayKey: string,
  patch: { status: "posted" | "failed"; scheduleId?: string | null; error?: string | null },
): Promise<void> {
  const db = getAdminFirestore();
  await db.collection(DAY_LOCK_COLLECTION).doc(dayKey).set(
    {
      ...patch,
      finishedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Publish today's bubbles map summary to Buffer (idempotent, weekday morning).
 * @param force skip weekday + hour window checks (still idempotent per day)
 */
export async function runBubblesBoardBufferAuto(opts?: {
  force?: boolean;
  dayKey?: string;
  now?: Date;
}): Promise<BubblesBoardBufferSummary> {
  const now = opts?.now ?? new Date();
  const dayKey = opts?.dayKey?.trim() || istDayKey(now);
  const contentId = contentIdForDay(dayKey);
  const imageUrl = ogImageUrl(dayKey);
  const force = opts?.force === true;

  const empty = (skipped: string): BubblesBoardBufferSummary => ({
    dayKey,
    skipped,
    status: "skipped",
    contentId,
    imageUrl: null,
    scheduleId: null,
    results: [],
  });

  if (!force && !isIstWeekday(now)) {
    return empty("Weekend — NSE session days only");
  }

  const hour = istHour(now);
  if (
    !force &&
    (hour < TODAY_BUFFER_HOUR_WINDOW.from || hour > TODAY_BUFFER_HOUR_WINDOW.to)
  ) {
    return empty(
      `Outside ${TODAY_BUFFER_HOUR_WINDOW.from}:00–${TODAY_BUFFER_HOUR_WINDOW.to}:00 IST window (now ${hour}:00 IST)`,
    );
  }

  if (!process.env.BUFFER_API_KEY?.trim()) {
    return empty("BUFFER_API_KEY not configured");
  }

  const posted = await getPostedContentMap(BUBBLES_BUFFER_SOURCE);
  if (posted[contentId]) {
    return empty(`Already posted today (${contentId})`);
  }

  const claim = await claimDayLock(dayKey);
  if (!claim.ok) return empty(claim.reason);

  try {
    const board = await loadBubblesBoard();
    if (!bubblesBoardHasSignal(board)) {
      await finishDayLock(dayKey, { status: "failed", error: "no_signal" });
      return empty("No bubbles map signal (S/R counts or MMI) yet");
    }

    try {
      const og = await fetch(imageUrl, { cache: "no-store" });
      if (!og.ok) {
        console.warn("[bubbles-board-buffer] OG warm HTTP", og.status);
      }
    } catch (e) {
      console.warn(
        "[bubbles-board-buffer] OG warm failed:",
        e instanceof Error ? e.message : e,
      );
    }

    const captions = buildBubblesBoardCaptions(board);
    const due = new Date(now.getTime() + BUBBLES_BUFFER_DELAY_MINUTES * 60_000);
    const result = await scheduleToBuffer({
      source: BUBBLES_BUFFER_SOURCE,
      contentId,
      contentLabel: `Bubbles map ${dayKey}`,
      imageUrl,
      captions,
      platforms: TODAY_BUFFER_PLATFORMS,
      timing: {
        mode: "scheduled",
        baseIso: due.toISOString(),
        jitterMinutes: 0,
      },
      createdBy: BUBBLES_BUFFER_CREATED_BY,
    });

    const ok = result.status === "ok" || result.status === "partial";
    await finishDayLock(dayKey, {
      status: ok ? "posted" : "failed",
      scheduleId: result.id,
      error: ok ? null : "buffer_failed",
    });

    return {
      dayKey,
      skipped: null,
      status: result.status,
      contentId,
      imageUrl,
      scheduleId: result.id,
      results: result.results,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishDayLock(dayKey, { status: "failed", error: msg }).catch(() => undefined);
    throw e;
  }
}
