/**
 * Automate SR-audit win-story posts to Buffer.
 *
 * Two phases (App Hosting timeout is ~120s — cloud renders take minutes):
 *   prepare  — pick up to MAX unposted success stories, kick off Cloud Run renders
 *   publish  — for ready renders, generate captions and schedule/share to Buffer
 *
 * Recommended cron-job.org schedule (IST):
 *   19:00 IST (13:30 UTC)  → ?phase=prepare
 *   21:00 IST (15:30 UTC)  → ?phase=publish   ← “post at 9 PM”
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import {
  cloudRenderConfigured,
  readRenderStatus,
  triggerStoryRender,
  VIDEO_RENDERS_COLLECTION,
  type RenderStatusDoc,
} from "@/lib/videos/cloud-render";
import { findSuccessStories, type SuccessStoryCandidate } from "@/lib/videos/success-story";
import { generateStoryCaptionsFromCandidate } from "@/lib/sr-audit/generate-story-captions";
import {
  getPostedContentMap,
  scheduleToBuffer,
  SOCIAL_POSTS_COLLECTION,
} from "@/lib/social/schedule";
import { listChannels } from "@/lib/social/buffer";
import {
  platformForBufferService,
  type SocialPlatformId,
} from "@/lib/social/platforms";

export const SR_BUFFER_AUTO_MAX_PER_DAY = 3;
export const SR_BUFFER_AUTO_SOURCE = "sr-audit";
/** Only auto-post wins with realized move strictly greater than this %. */
export const SR_BUFFER_AUTO_MIN_MOVE_PCT = 3;
/** Target publish clock — 9:00 PM India Standard Time. */
export const SR_BUFFER_AUTO_HOUR_IST = 21;
/** Per-channel schedule jitter (same video once; channels get staggered due times). */
export const SR_BUFFER_AUTO_JITTER_MINUTES = 20;

const QUEUE_COLLECTION = "sr_audit_buffer_days";
const RUN_LOCK_DOC = "config/sr_audit_buffer_run_lock";

export type BufferAutoPhase = "prepare" | "publish" | "auto";

export interface BufferAutoQueueItem {
  storyId: string;
  symbol: string;
  label: string;
  renderId: string;
  status: "rendering" | "ready" | "scheduled" | "failed";
  videoUrl?: string | null;
  scheduleId?: string | null;
  error?: string | null;
  updatedAt: string;
}

export interface BufferAutoDayDoc {
  dayKey: string;
  items: BufferAutoQueueItem[];
  preparedAt?: string;
  publishedAt?: string;
  updatedAt: string;
}

export interface BufferAutoRunSummary {
  phase: "prepare" | "publish";
  dayKey: string;
  maxPerDay: number;
  alreadyPostedToday: number;
  queued: number;
  started: number;
  scheduled: number;
  failed: number;
  skipped: string | null;
  items: Array<{
    storyId: string;
    symbol: string;
    status: BufferAutoQueueItem["status"];
    error?: string | null;
  }>;
}

/** Calendar day key in Asia/Kolkata (YYYY-MM-DD). */
export function istDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current hour (0–23) in Asia/Kolkata. */
export function istHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  // en-GB can yield "24" for midnight in some engines — normalize.
  return h === 24 ? 0 : h;
}

/** Today's 9:00 PM IST as UTC ISO. */
export function ninePmIstIso(dayKey = istDayKey()): string {
  return new Date(`${dayKey}T${String(SR_BUFFER_AUTO_HOUR_IST).padStart(2, "0")}:00:00+05:30`).toISOString();
}

export function resolveAutoPhase(now = new Date()): "prepare" | "publish" {
  // Before 9 PM IST → prepare (render). At/after 9 PM → publish.
  return istHour(now) < SR_BUFFER_AUTO_HOUR_IST ? "prepare" : "publish";
}

async function tryAcquireLock(db: Firestore, ttlMs = 110_000): Promise<boolean> {
  const ref = db.doc(RUN_LOCK_DOC);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const untilMs = snap.exists
      ? new Date(String((snap.data() as { until?: string }).until ?? 0)).getTime()
      : 0;
    if (untilMs > now) return false;
    tx.set(ref, {
      until: new Date(now + ttlMs).toISOString(),
      startedAt: new Date(now).toISOString(),
    });
    return true;
  });
}

async function releaseLock(db: Firestore): Promise<void> {
  try {
    await db.doc(RUN_LOCK_DOC).delete();
  } catch {
    /* best-effort */
  }
}

/** Count successful sr-audit Buffer posts created on this IST calendar day. */
export async function countPostedToday(db: Firestore, dayKey = istDayKey()): Promise<number> {
  const startIso = new Date(`${dayKey}T00:00:00+05:30`).toISOString();
  const endIso = new Date(`${dayKey}T23:59:59.999+05:30`).toISOString();
  const snap = await db
    .collection(SOCIAL_POSTS_COLLECTION)
    .where("source", "==", SR_BUFFER_AUTO_SOURCE)
    .get();

  let n = 0;
  const seen = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data() as {
      contentId?: string;
      createdAt?: string;
      status?: string;
      results?: Array<{ status?: string }>;
    };
    const at = d.createdAt ?? "";
    if (at < startIso || at > endIso) continue;
    const live = (d.results ?? []).some(
      (r) => r.status === "posted" || r.status === "scheduled",
    );
    if (!live && d.status !== "ok" && d.status !== "partial") continue;
    const id = d.contentId ?? doc.id;
    if (seen.has(id)) continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

async function loadDay(db: Firestore, dayKey: string): Promise<BufferAutoDayDoc> {
  const snap = await db.collection(QUEUE_COLLECTION).doc(dayKey).get();
  if (!snap.exists) {
    return { dayKey, items: [], updatedAt: new Date().toISOString() };
  }
  const data = snap.data() as BufferAutoDayDoc;
  return {
    dayKey,
    items: Array.isArray(data.items) ? data.items : [],
    preparedAt: data.preparedAt,
    publishedAt: data.publishedAt,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

async function saveDay(db: Firestore, doc: BufferAutoDayDoc): Promise<void> {
  await db
    .collection(QUEUE_COLLECTION)
    .doc(doc.dayKey)
    .set({ ...doc, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Reuse a prior successful cloud render for this story when available. */
async function findReadyRenderUrl(
  db: Firestore,
  storyId: string,
): Promise<{ renderId: string; url: string } | null> {
  try {
    // Prefer equality filters; if the composite index is missing, fall through.
    const snap = await db
      .collection(VIDEO_RENDERS_COLLECTION)
      .where("source", "==", SR_BUFFER_AUTO_SOURCE)
      .where("topicId", "==", storyId)
      .limit(10)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data() as RenderStatusDoc;
      if (d.status === "ready" && typeof d.url === "string" && d.url.startsWith("http")) {
        return { renderId: doc.id, url: d.url };
      }
    }
  } catch (e) {
    console.warn(
      "[sr-audit-buffer] findReadyRenderUrl skipped:",
      e instanceof Error ? e.message : e,
    );
  }
  return null;
}

async function connectedPlatforms(): Promise<SocialPlatformId[]> {
  const channels = await listChannels();
  const out: SocialPlatformId[] = [];
  const seen = new Set<SocialPlatformId>();
  for (const ch of channels) {
    const id = platformForBufferService(ch.service);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function prepareDay(db: Firestore, dayKey: string): Promise<BufferAutoRunSummary> {
  if (!cloudRenderConfigured()) {
    return {
      phase: "prepare",
      dayKey,
      maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
      alreadyPostedToday: 0,
      queued: 0,
      started: 0,
      scheduled: 0,
      failed: 0,
      skipped: "cloud_render_not_configured",
      items: [],
    };
  }

  const postedToday = await countPostedToday(db, dayKey);
  const day = await loadDay(db, dayKey);
  const slotsLeft = Math.max(
    0,
    SR_BUFFER_AUTO_MAX_PER_DAY - Math.max(postedToday, day.items.length),
  );

  if (slotsLeft <= 0) {
    return {
      phase: "prepare",
      dayKey,
      maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
      alreadyPostedToday: postedToday,
      queued: day.items.length,
      started: 0,
      scheduled: 0,
      failed: 0,
      skipped: "daily_cap_reached",
      items: day.items.map((i) => ({
        storyId: i.storyId,
        symbol: i.symbol,
        status: i.status,
        error: i.error,
      })),
    };
  }

  const postedMap = await getPostedContentMap(SR_BUFFER_AUTO_SOURCE);
  // Never re-queue a story already on today's list (incl. failed/scheduled).
  const queuedIds = new Set(day.items.map((i) => i.storyId));
  // Oldest unposted backlog first; move must be > 3%.
  const stories = await findSuccessStories(db, {
    requireSnapshot: true,
    withinDays: 365,
    scanLimit: 2000,
    minMovePct: SR_BUFFER_AUTO_MIN_MOVE_PCT,
    order: "oldest",
  });

  const picks: SuccessStoryCandidate[] = [];
  for (const s of stories) {
    if (picks.length >= slotsLeft) break;
    if (queuedIds.has(s.id)) continue;
    if (postedMap[s.id]) continue; // already posted/scheduled to Buffer before
    picks.push(s);
  }

  if (picks.length === 0) {
    return {
      phase: "prepare",
      dayKey,
      maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
      alreadyPostedToday: postedToday,
      queued: day.items.length,
      started: 0,
      scheduled: 0,
      failed: 0,
      skipped: day.items.length ? null : "no_unposted_success_stories",
      items: day.items.map((i) => ({
        storyId: i.storyId,
        symbol: i.symbol,
        status: i.status,
        error: i.error,
      })),
    };
  }

  let started = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const story of picks) {
    try {
      const existing = await findReadyRenderUrl(db, story.id);
      if (existing) {
        day.items.push({
          storyId: story.id,
          symbol: story.symbol,
          label: story.label,
          renderId: existing.renderId,
          status: "ready",
          videoUrl: existing.url,
          updatedAt: nowIso,
        });
        started += 1;
        continue;
      }

      const renderId = await triggerStoryRender({
        storyId: story.id,
        createdBy: "cron:sr-audit-buffer-posts",
      });
      day.items.push({
        storyId: story.id,
        symbol: story.symbol,
        label: story.label,
        renderId,
        status: "rendering",
        updatedAt: nowIso,
      });
      started += 1;
    } catch (e) {
      failed += 1;
      day.items.push({
        storyId: story.id,
        symbol: story.symbol,
        label: story.label,
        renderId: "",
        status: "failed",
        error: e instanceof Error ? e.message : "render_trigger_failed",
        updatedAt: nowIso,
      });
    }
  }

  day.preparedAt = nowIso;
  await saveDay(db, day);

  return {
    phase: "prepare",
    dayKey,
    maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
    alreadyPostedToday: postedToday,
    queued: day.items.length,
    started,
    scheduled: 0,
    failed,
    skipped: null,
    items: day.items.map((i) => ({
      storyId: i.storyId,
      symbol: i.symbol,
      status: i.status,
      error: i.error,
    })),
  };
}

async function publishDay(db: Firestore, dayKey: string): Promise<BufferAutoRunSummary> {
  const postedToday = await countPostedToday(db, dayKey);
  const day = await loadDay(db, dayKey);

  if (day.items.length === 0) {
    // Late prepare: if publish fires without a morning prepare, try to queue now.
    const prep = await prepareDay(db, dayKey);
    if (prep.queued === 0) {
      return {
        ...prep,
        phase: "publish",
        skipped: prep.skipped ?? "nothing_queued",
      };
    }
    // Fall through with freshly prepared queue (may still be rendering).
    Object.assign(day, await loadDay(db, dayKey));
  }

  const platforms = await connectedPlatforms();
  if (platforms.length === 0) {
    return {
      phase: "publish",
      dayKey,
      maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
      alreadyPostedToday: postedToday,
      queued: day.items.length,
      started: 0,
      scheduled: 0,
      failed: 0,
      skipped: "no_buffer_channels",
      items: day.items.map((i) => ({
        storyId: i.storyId,
        symbol: i.symbol,
        status: i.status,
        error: i.error,
      })),
    };
  }

  const stories = await findSuccessStories(db, {
    requireSnapshot: true,
    withinDays: 365,
    scanLimit: 2000,
    minMovePct: SR_BUFFER_AUTO_MIN_MOVE_PCT,
    order: "oldest",
  });
  const byId = new Map(stories.map((s) => [s.id, s]));
  const postedMap = await getPostedContentMap(SR_BUFFER_AUTO_SOURCE);

  const baseIso = ninePmIstIso(dayKey);
  const nowIso = new Date().toISOString();
  let scheduled = 0;
  let failed = 0;
  let room = Math.max(0, SR_BUFFER_AUTO_MAX_PER_DAY - postedToday);

  for (const item of day.items) {
    if (item.status === "scheduled") continue;
    if (item.status === "failed" && !item.renderId) continue;
    if (room <= 0) break;

    // Hard duplicate guard — never schedule the same story twice (manual or auto).
    if (postedMap[item.storyId]) {
      item.status = "scheduled";
      item.error = null;
      item.updatedAt = nowIso;
      continue;
    }

    try {
      let videoUrl = item.videoUrl ?? null;
      if (!videoUrl && item.renderId) {
        const st = await readRenderStatus(item.renderId);
        if (st?.status === "ready" && st.url) {
          videoUrl = st.url;
          item.status = "ready";
          item.videoUrl = videoUrl;
        } else if (st?.status === "failed") {
          item.status = "failed";
          item.error = st.error ?? st.reason ?? "render_failed";
          failed += 1;
          item.updatedAt = nowIso;
          continue;
        } else {
          // Still rendering — leave for a later tick / manual retry.
          item.status = "rendering";
          item.updatedAt = nowIso;
          continue;
        }
      }

      if (!videoUrl) {
        item.status = "failed";
        item.error = "missing_video_url";
        failed += 1;
        item.updatedAt = nowIso;
        continue;
      }

      const candidate = byId.get(item.storyId);
      if (!candidate) {
        item.status = "failed";
        item.error = "story_not_found";
        failed += 1;
        item.updatedAt = nowIso;
        continue;
      }
      if (!(candidate.movePct > SR_BUFFER_AUTO_MIN_MOVE_PCT)) {
        item.status = "failed";
        item.error = `move_pct_below_${SR_BUFFER_AUTO_MIN_MOVE_PCT}`;
        failed += 1;
        item.updatedAt = nowIso;
        continue;
      }

      const captionsUi = await generateStoryCaptionsFromCandidate(candidate);
      const captions: Partial<Record<SocialPlatformId, string>> = {
        twitter: captionsUi.twitter,
        facebook: captionsUi.facebook,
        linkedin: captionsUi.linkedin,
        instagram: captionsUi.instagram,
        youtube: [captionsUi.youtubeTitle, captionsUi.youtubeDescription]
          .filter(Boolean)
          .join("\n\n")
          .trim(),
      };

      const result = await scheduleToBuffer({
        source: SR_BUFFER_AUTO_SOURCE,
        contentId: item.storyId,
        contentLabel: `${item.symbol} · win story`,
        videoUrl,
        captions,
        platforms,
        timing: {
          mode: "scheduled",
          baseIso,
          jitterMinutes: SR_BUFFER_AUTO_JITTER_MINUTES,
        },
        createdBy: "cron:sr-audit-buffer-posts",
      });

      if (result.status === "failed") {
        item.status = "failed";
        item.error = result.results.map((r) => r.error).filter(Boolean).join("; ") || "schedule_failed";
        failed += 1;
      } else {
        item.status = "scheduled";
        item.scheduleId = result.id;
        item.videoUrl = videoUrl;
        item.error = null;
        scheduled += 1;
        room -= 1;
        // Mark immediately so a later item / retry in this run can't double-post.
        postedMap[item.storyId] = {
          at: nowIso,
          status: result.status,
          platforms: result.results
            .filter((r) => r.status === "posted" || r.status === "scheduled")
            .map((r) => r.platform),
        };
      }
      item.updatedAt = nowIso;
    } catch (e) {
      item.status = "failed";
      item.error = e instanceof Error ? e.message : "publish_failed";
      item.updatedAt = nowIso;
      failed += 1;
    }
  }

  day.publishedAt = nowIso;
  await saveDay(db, day);

  const stillRendering = day.items.some((i) => i.status === "rendering");

  return {
    phase: "publish",
    dayKey,
    maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
    alreadyPostedToday: postedToday + scheduled,
    queued: day.items.length,
    started: 0,
    scheduled,
    failed,
    skipped: stillRendering ? "some_still_rendering" : null,
    items: day.items.map((i) => ({
      storyId: i.storyId,
      symbol: i.symbol,
      status: i.status,
      error: i.error,
    })),
  };
}

/**
 * Run one automation tick. Uses a short lock so overlapping cron ticks don't
 * double-queue. Safe to call via after() from the HTTP cron handler.
 */
export async function runSrAuditBufferAuto(opts?: {
  phase?: BufferAutoPhase;
  dayKey?: string;
}): Promise<BufferAutoRunSummary> {
  const db = getAdminFirestore();
  const dayKey = opts?.dayKey ?? istDayKey();
  const requested = opts?.phase ?? "auto";
  const phase = requested === "auto" ? resolveAutoPhase() : requested;

  const acquired = await tryAcquireLock(db);
  if (!acquired) {
    return {
      phase,
      dayKey,
      maxPerDay: SR_BUFFER_AUTO_MAX_PER_DAY,
      alreadyPostedToday: await countPostedToday(db, dayKey),
      queued: 0,
      started: 0,
      scheduled: 0,
      failed: 0,
      skipped: "already_running",
      items: [],
    };
  }

  try {
    return phase === "prepare" ? await prepareDay(db, dayKey) : await publishDay(db, dayKey);
  } finally {
    await releaseLock(db);
  }
}
