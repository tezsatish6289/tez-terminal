/**
 * Automate SR-audit win-story posts to Buffer (+ email via scheduleToBuffer).
 *
 * Selection: at most ONE reel/day, biased to biggest movePct. Day key uses
 * resolution time (resolvedAt ?? pocHitAt ?? eventAt), not entry.
 *
 * Cascade (no persistent backlog queue):
 *   1. Resolved today IST with move > 3%
 *   2. Else best unposted in last 7 days with move > 3%
 *   3. Else resolved today with move ≥ 1%
 *   4. Else skip
 *
 * Two phases (App Hosting timeout is ~120s — cloud renders take minutes):
 *   prepare  — pick today's best story (if any), kick off Cloud Run render
 *   publish  — for ready render, generate captions and schedule to Buffer
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
import {
  findSuccessStories,
  qualifySuccessStory,
  type SuccessStoryCandidate,
} from "@/lib/videos/success-story";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
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

export const SR_BUFFER_AUTO_MAX_PER_DAY = 1;
export const SR_BUFFER_AUTO_SOURCE = "sr-audit";
/** Preferred floor — realized move strictly greater than this %. */
export const SR_BUFFER_AUTO_MIN_MOVE_PCT = 3;
/** Soft floor when no >3% win exists today or in lookback (inclusive). */
export const SR_BUFFER_AUTO_SOFT_FLOOR_MIN_MOVE_PCT = 1;
/** Finite lookback window (IST calendar days, including today). No backlog queue. */
export const SR_BUFFER_AUTO_LOOKBACK_DAYS = 7;
/** Target publish clock — 9:00 PM India Standard Time. */
export const SR_BUFFER_AUTO_HOUR_IST = 21;
/** Per-channel schedule jitter (same video once; channels get staggered due times). */
export const SR_BUFFER_AUTO_JITTER_MINUTES = 20;

export type BufferAutoSelectionTier = "today_hard" | "lookback_hard" | "today_soft";

const QUEUE_COLLECTION = "sr_audit_buffer_days";
const RUN_LOCK_DOC = "config/sr_audit_buffer_run_lock";

export type BufferAutoPhase = "prepare" | "publish" | "auto";

export interface BufferAutoQueueItem {
  storyId: string;
  symbol: string;
  label: string;
  renderId: string;
  status: "rendering" | "ready" | "partial" | "scheduled" | "failed";
  /** Which selection cascade tier queued this story (prepare). */
  selectionTier?: BufferAutoSelectionTier | null;
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

/** IST calendar day of the win (resolution / POC / entry). */
export function storyDayKey(s: Pick<SuccessStoryCandidate, "dayAt" | "eventAt">): string {
  return istDayKey(new Date(s.dayAt || s.eventAt));
}

/** True when storyDay is on dayKey or within the prior (lookbackDays - 1) IST days. */
export function isWithinLookbackDays(
  storyDay: string,
  dayKey: string,
  lookbackDays = SR_BUFFER_AUTO_LOOKBACK_DAYS,
): boolean {
  const dayMs = new Date(`${dayKey}T00:00:00+05:30`).getTime();
  const storyMs = new Date(`${storyDay}T00:00:00+05:30`).getTime();
  if (!Number.isFinite(dayMs) || !Number.isFinite(storyMs)) return false;
  const diffDays = (dayMs - storyMs) / 86_400_000;
  return diffDays >= 0 && diffDays < lookbackDays;
}

function byBiggestMoveThenNewest(
  a: SuccessStoryCandidate,
  b: SuccessStoryCandidate,
): number {
  return (
    b.movePct - a.movePct ||
    Date.parse(b.dayAt) - Date.parse(a.dayAt) ||
    Date.parse(b.eventAt) - Date.parse(a.eventAt)
  );
}

/**
 * Scan recent snapshot-ready wins (no move floor in the query) and pick via
 * the daily cascade. Entry window is slightly wider than lookback so delayed
 * resolutions still appear.
 */
async function findDailyAutoStory(
  db: Firestore,
  dayKey: string,
  opts: {
    postedMap: Awaited<ReturnType<typeof getPostedContentMap>>;
    platforms: SocialPlatformId[];
    queuedIds: Set<string>;
  },
): Promise<{ story: SuccessStoryCandidate; tier: BufferAutoSelectionTier } | null> {
  const stories = await findSuccessStories(db, {
    requireSnapshot: true,
    // Entry scan wider than lookback: wins often resolve days after entry.
    withinDays: SR_BUFFER_AUTO_LOOKBACK_DAYS + 7,
    scanLimit: 500,
    order: "newest",
  });

  const eligible = stories.filter((s) => {
    if (opts.queuedIds.has(s.id)) return false;
    if (fullyPosted(opts.postedMap[s.id], opts.platforms)) return false;
    return isWithinLookbackDays(storyDayKey(s), dayKey);
  });

  const pick = (pool: SuccessStoryCandidate[]): SuccessStoryCandidate | null => {
    if (pool.length === 0) return null;
    return [...pool].sort(byBiggestMoveThenNewest)[0] ?? null;
  };

  const todayHard = pick(
    eligible.filter(
      (s) =>
        storyDayKey(s) === dayKey && s.movePct > SR_BUFFER_AUTO_MIN_MOVE_PCT,
    ),
  );
  if (todayHard) return { story: todayHard, tier: "today_hard" };

  const lookbackHard = pick(
    eligible.filter((s) => s.movePct > SR_BUFFER_AUTO_MIN_MOVE_PCT),
  );
  if (lookbackHard) return { story: lookbackHard, tier: "lookback_hard" };

  const todaySoft = pick(
    eligible.filter(
      (s) =>
        storyDayKey(s) === dayKey &&
        s.movePct >= SR_BUFFER_AUTO_SOFT_FLOOR_MIN_MOVE_PCT,
    ),
  );
  if (todaySoft) return { story: todaySoft, tier: "today_soft" };

  return null;
}

/**
 * Load a queued story for publish. Accepts hard-floor and soft-floor picks
 * (move ≥ soft floor); does not re-apply the today-only entry filter.
 */
async function loadSuccessStoryById(
  db: Firestore,
  storyId: string,
): Promise<SuccessStoryCandidate | null> {
  const doc = await db.collection(SR_ZONE_EVENTS_COLLECTION).doc(storyId).get();
  if (!doc.exists) return null;
  const candidate = qualifySuccessStory({
    id: doc.id,
    ...(doc.data() as SrZoneEvent),
  });
  if (!candidate) return null;
  if (!(candidate.movePct >= SR_BUFFER_AUTO_SOFT_FLOOR_MIN_MOVE_PCT)) return null;
  return candidate;
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

/** Successful sr-audit posts whose createdAt falls on this IST calendar day. */
export async function listPostedToday(
  db: Firestore,
  dayKey = istDayKey(),
  opts?: { /** When true, only count evening auto-cron posts (ignore manual admin). */ autoOnly?: boolean },
): Promise<
  Array<{
    id: string;
    contentId: string;
    contentLabel: string | null;
    createdAt: string;
    status: string | null;
    createdBy: string | null;
    results: Array<{ platform?: string; status?: string; error?: string | null }>;
  }>
> {
  const startIso = new Date(`${dayKey}T00:00:00+05:30`).toISOString();
  const endIso = new Date(`${dayKey}T23:59:59.999+05:30`).toISOString();
  const snap = await db
    .collection(SOCIAL_POSTS_COLLECTION)
    .where("source", "==", SR_BUFFER_AUTO_SOURCE)
    .get();

  const out: Array<{
    id: string;
    contentId: string;
    contentLabel: string | null;
    createdAt: string;
    status: string | null;
    createdBy: string | null;
    results: Array<{ platform?: string; status?: string; error?: string | null }>;
  }> = [];
  const seen = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data() as {
      contentId?: string;
      contentLabel?: string;
      createdAt?: string;
      status?: string;
      createdBy?: string;
      results?: Array<{ platform?: string; status?: string; error?: string | null }>;
    };
    const at = d.createdAt ?? "";
    if (at < startIso || at > endIso) continue;
    if (opts?.autoOnly && d.createdBy !== "cron:sr-audit-buffer-posts") continue;
    const live = (d.results ?? []).some(
      (r) => r.status === "posted" || r.status === "scheduled",
    );
    if (!live && d.status !== "ok" && d.status !== "partial") continue;
    const contentId = d.contentId ?? doc.id;
    if (seen.has(contentId)) continue;
    seen.add(contentId);
    out.push({
      id: doc.id,
      contentId,
      contentLabel: d.contentLabel ?? null,
      createdAt: at,
      status: d.status ?? null,
      createdBy: d.createdBy ?? null,
      results: d.results ?? [],
    });
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** Count successful auto-cron sr-audit Buffer posts on this IST calendar day. */
export async function countPostedToday(db: Firestore, dayKey = istDayKey()): Promise<number> {
  return (await listPostedToday(db, dayKey, { autoOnly: true })).length;
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

/** True when every connected channel already has a successful post/schedule. */
function fullyPosted(
  posted: { platforms: SocialPlatformId[] } | undefined,
  needed: SocialPlatformId[],
): boolean {
  if (!posted || needed.length === 0) return false;
  const have = new Set(posted.platforms);
  return needed.every((p) => have.has(p));
}

function missingPlatforms(
  posted: { platforms: SocialPlatformId[] } | undefined,
  needed: SocialPlatformId[],
): SocialPlatformId[] {
  const have = new Set(posted?.platforms ?? []);
  return needed.filter((p) => !have.has(p));
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
  const platforms = await connectedPlatforms();
  // Never re-queue a story already on today's list (incl. failed/scheduled).
  const queuedIds = new Set(day.items.map((i) => i.storyId));

  const picks: Array<{ story: SuccessStoryCandidate; tier: BufferAutoSelectionTier }> = [];
  // Cascade returns one best story; loop in case we need multiple slots later.
  while (picks.length < slotsLeft) {
    const next = await findDailyAutoStory(db, dayKey, {
      postedMap,
      platforms,
      queuedIds: new Set([...queuedIds, ...picks.map((p) => p.story.id)]),
    });
    if (!next) break;
    picks.push(next);
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

  for (const { story, tier } of picks) {
    try {
      const existing = await findReadyRenderUrl(db, story.id);
      if (existing) {
        day.items.push({
          storyId: story.id,
          symbol: story.symbol,
          label: story.label,
          renderId: existing.renderId,
          status: "ready",
          selectionTier: tier,
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
        selectionTier: tier,
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
        selectionTier: tier,
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

  const postedMap = await getPostedContentMap(SR_BUFFER_AUTO_SOURCE);

  const baseIso = ninePmIstIso(dayKey);
  const nowIso = new Date().toISOString();
  let scheduled = 0;
  let failed = 0;
  let room = Math.max(0, SR_BUFFER_AUTO_MAX_PER_DAY - postedToday);

  for (const item of day.items) {
    if (item.status === "failed" && !item.renderId && !item.videoUrl) continue;

    const alreadyPosted = postedMap[item.storyId];
    const targets = missingPlatforms(alreadyPosted, platforms);
    if (targets.length === 0) {
      item.status = "scheduled";
      item.error = null;
      item.updatedAt = nowIso;
      continue;
    }

    // New stories consume a daily slot; filling missing channels on a partial
    // post (e.g. YouTube-only) does not.
    const isNewStory = !alreadyPosted || alreadyPosted.platforms.length === 0;
    if (isNewStory && room <= 0) continue;

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

      const candidate = await loadSuccessStoryById(db, item.storyId);
      if (!candidate) {
        item.status = "failed";
        item.error = "story_not_found_or_below_move_floor";
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
        platforms: targets,
        timing: {
          mode: "scheduled",
          baseIso,
          jitterMinutes: SR_BUFFER_AUTO_JITTER_MINUTES,
        },
        createdBy: "cron:sr-audit-buffer-posts",
      });

      const okPlatforms = result.results
        .filter((r) => r.status === "posted" || r.status === "scheduled")
        .map((r) => r.platform);
      const errParts = result.results
        .filter((r) => r.status === "failed" || r.status === "skipped")
        .map((r) => `${r.platform}: ${r.error || r.status}`);

      if (okPlatforms.length === 0) {
        item.status = "failed";
        item.error = errParts.join("; ") || "schedule_failed";
        failed += 1;
      } else {
        const merged = new Set([...(alreadyPosted?.platforms ?? []), ...okPlatforms]);
        postedMap[item.storyId] = {
          at: nowIso,
          status: merged.size >= platforms.length ? "ok" : "partial",
          platforms: [...merged] as SocialPlatformId[],
        };
        item.status = fullyPosted(postedMap[item.storyId], platforms) ? "scheduled" : "partial";
        item.scheduleId = result.id;
        item.videoUrl = videoUrl;
        item.error = errParts.length ? errParts.join("; ") : null;
        if (isNewStory) {
          scheduled += 1;
          room -= 1;
        } else {
          scheduled += 1; // count fill-ins in the summary too
        }
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
