/**
 * Automate the morning FNO Ninja "levels today" Buffer post (image + /today link).
 *
 * Recommended cron-job.org (IST):
 *   08:00 IST (02:30 UTC) Mon–Fri
 *   GET /api/cron/today-board-buffer?key=CRON_SECRET
 *
 * Idempotent: at most one auto post per IST calendar day (source=today-board).
 * Skips weekends. YouTube omitted (needs video; this is an image card).
 */

import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import { buildTodayBoardCaptions } from "@/lib/fnoninja/today-board-captions";
import { loadTodayBoard } from "@/lib/fnoninja/today-board";
import {
  getPostedContentMap,
  scheduleToBuffer,
  type ChannelResult,
  type ScheduleResult,
} from "@/lib/social/schedule";
import type { SocialPlatformId } from "@/lib/social/platforms";

export const TODAY_BUFFER_SOURCE = "today-board";
export const TODAY_BUFFER_CREATED_BY = "cron:today-board-buffer";
/** Target publish hour in Asia/Kolkata. */
export const TODAY_BUFFER_HOUR_IST = 8;
/** Accept cron ticks in this IST hour window (inclusive) unless force=1. */
export const TODAY_BUFFER_HOUR_WINDOW = { from: 7, to: 10 } as const;

export const TODAY_BUFFER_PLATFORMS: SocialPlatformId[] = [
  "twitter",
  "facebook",
  "linkedin",
  "instagram",
];

const DAY_LOCK_COLLECTION = "today_board_buffer_days";

export type TodayBoardBufferSummary = {
  dayKey: string;
  skipped: string | null;
  status: ScheduleResult["status"] | "skipped";
  contentId: string;
  imageUrl: string | null;
  scheduleId: string | null;
  results: ChannelResult[];
};

/** Calendar day key in Asia/Kolkata (YYYY-MM-DD). */
export function istDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function istHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return h === 24 ? 0 : h;
}

/** Mon–Fri in Asia/Kolkata. */
export function isIstWeekday(now = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  return day !== "Sat" && day !== "Sun";
}

function ogImageUrl(dayKey: string): string {
  return `${FNONINJA_SITE_URL}/today/opengraph-image?d=${encodeURIComponent(dayKey)}`;
}

function contentIdForDay(dayKey: string): string {
  return `today-board-${dayKey}`;
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
          claimedBy: TODAY_BUFFER_CREATED_BY,
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
 * Publish today's levels board to Buffer (idempotent, weekday morning).
 * @param force skip weekday + hour window checks (still idempotent per day)
 */
export async function runTodayBoardBufferAuto(opts?: {
  force?: boolean;
  dayKey?: string;
  now?: Date;
}): Promise<TodayBoardBufferSummary> {
  const now = opts?.now ?? new Date();
  const dayKey = opts?.dayKey?.trim() || istDayKey(now);
  const contentId = contentIdForDay(dayKey);
  const imageUrl = ogImageUrl(dayKey);
  const force = opts?.force === true;

  const empty = (skipped: string): TodayBoardBufferSummary => ({
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

  const posted = await getPostedContentMap(TODAY_BUFFER_SOURCE);
  if (posted[contentId]) {
    return empty(`Already posted today (${contentId})`);
  }

  const claim = await claimDayLock(dayKey);
  if (!claim.ok) return empty(claim.reason);

  try {
    const board = await loadTodayBoard();
    const hasNumbers = board.indices.some(
      (i) => i.spot != null || i.putWall != null || i.callWall != null,
    );
    if (!hasNumbers) {
      await finishDayLock(dayKey, { status: "failed", error: "no_levels" });
      return empty("No Nifty/BankNifty levels available yet");
    }

    // Warm OG so Buffer's fetch is less likely to hit a cold generate.
    try {
      const og = await fetch(imageUrl, { cache: "no-store" });
      if (!og.ok) {
        console.warn("[today-board-buffer] OG warm HTTP", og.status);
      }
    } catch (e) {
      console.warn(
        "[today-board-buffer] OG warm failed:",
        e instanceof Error ? e.message : e,
      );
    }

    const captions = buildTodayBoardCaptions(board);
    const result = await scheduleToBuffer({
      source: TODAY_BUFFER_SOURCE,
      contentId,
      contentLabel: `Levels today ${dayKey}`,
      imageUrl,
      captions,
      platforms: TODAY_BUFFER_PLATFORMS,
      timing: { mode: "now" },
      createdBy: TODAY_BUFFER_CREATED_BY,
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
