/**
 * Orchestrates a multi-channel Buffer publish for one piece of video content.
 *
 * One video → one post PER channel, each with its own (clamped) caption and an
 * independently jittered publish time so the cadence never looks robotic. The
 * outcome is recorded in the `social_posts` Firestore collection for the queue
 * UI / audit log.
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { createBufferPost, listChannels } from "@/lib/social/buffer";
import {
  clampCaption,
  getPlatform,
  normalizeCaption,
  platformForBufferService,
  type SocialPlatformId,
} from "@/lib/social/platforms";

export const SOCIAL_POSTS_COLLECTION = "social_posts";

/** YouTube category id Buffer requires (default "22" People & Blogs). */
const YOUTUBE_CATEGORY_ID = process.env.BUFFER_YOUTUBE_CATEGORY_ID?.trim() || "22";

export type ScheduleTiming =
  | { mode: "now" }
  | { mode: "scheduled"; baseIso: string; jitterMinutes: number };

export interface ScheduleInput {
  /** Content source, e.g. "videos" (put/call clusters) or "sr-audit" (win stories). */
  source: string;
  contentId: string;
  contentLabel: string;
  /** Public, stable .mp4 URL Buffer can fetch at publish time. */
  videoUrl: string;
  /** Caption text per platform (already AI-generated; we clamp before posting). */
  captions: Partial<Record<SocialPlatformId, string>>;
  platforms: SocialPlatformId[];
  timing: ScheduleTiming;
  createdBy?: string;
}

export interface ChannelResult {
  platform: SocialPlatformId;
  status: "posted" | "scheduled" | "skipped" | "failed";
  channelId?: string;
  postId?: string;
  dueAt?: string;
  charCount?: number;
  error?: string;
}

export interface ScheduleResult {
  id: string;
  status: "ok" | "partial" | "failed";
  results: ChannelResult[];
}

/** Build a channel-per-platform map from the connected Buffer channels. */
async function resolveChannelMap(): Promise<Map<SocialPlatformId, string>> {
  const channels = await listChannels();
  const map = new Map<SocialPlatformId, string>();
  for (const ch of channels) {
    const platform = platformForBufferService(ch.service);
    if (platform && !map.has(platform)) map.set(platform, ch.id);
  }
  return map;
}

/** base + random(0..jitter) minutes, as ISO-8601 UTC. Never earlier than now+1min. */
function jitteredDueAt(baseIso: string, jitterMinutes: number): string {
  const base = Date.parse(baseIso);
  const floor = Date.now() + 60_000;
  const jitterMs = Math.floor(Math.random() * Math.max(0, jitterMinutes) * 60_000);
  const when = Math.max(Number.isFinite(base) ? base : floor, floor) + jitterMs;
  return new Date(when).toISOString();
}

export async function scheduleToBuffer(input: ScheduleInput): Promise<ScheduleResult> {
  const channelMap = await resolveChannelMap();
  const results: ChannelResult[] = [];

  for (const platform of input.platforms) {
    const def = getPlatform(platform);
    const raw = input.captions[platform];
    const channelId = channelMap.get(platform);

    if (!def) {
      results.push({ platform, status: "skipped", error: "Unknown platform" });
      continue;
    }
    if (!channelId) {
      results.push({ platform, status: "skipped", error: `No connected ${def.label} channel in Buffer` });
      continue;
    }
    if (!raw || !raw.trim()) {
      results.push({ platform, status: "skipped", channelId, error: "No caption provided" });
      continue;
    }

    const normalized = normalizeCaption(raw);
    let text = clampCaption(normalized, def.postBudget);
    let youtubeTitle: string | undefined;
    let youtubeCategoryId: string | undefined;
    if (platform === "youtube") {
      // The youtube caption arrives as "Title\n\nDescription" — Buffer needs an
      // explicit title, and the post text becomes the video description.
      const blocks = normalized.split(/\n{2,}/);
      const first = (blocks[0] ?? "").trim();
      const rest = blocks.slice(1).join("\n\n").trim();
      youtubeTitle = (first || normalized).replace(/\s+/g, " ").slice(0, 95);
      text = clampCaption(rest || normalized, def.postBudget);
      youtubeCategoryId = YOUTUBE_CATEGORY_ID;
    }

    const dueAt =
      input.timing.mode === "scheduled"
        ? jitteredDueAt(input.timing.baseIso, input.timing.jitterMinutes)
        : undefined;

    try {
      const { postId } = await createBufferPost({
        channelId,
        network: platform,
        text,
        videoUrl: input.videoUrl,
        dueAt,
        mode: input.timing.mode === "scheduled" ? "customScheduled" : "shareNow",
        youtubeTitle,
        youtubeCategoryId,
      });
      results.push({
        platform,
        status: input.timing.mode === "scheduled" ? "scheduled" : "posted",
        channelId,
        postId,
        dueAt,
        charCount: text.length,
      });
    } catch (e) {
      results.push({
        platform,
        status: "failed",
        channelId,
        charCount: text.length,
        error: e instanceof Error ? e.message : "Buffer post failed",
      });
    }
  }

  const anyOk = results.some((r) => r.status === "posted" || r.status === "scheduled");
  const anyBad = results.some((r) => r.status === "failed" || r.status === "skipped");
  const status: ScheduleResult["status"] = anyOk ? (anyBad ? "partial" : "ok") : "failed";

  // Persist an audit record. The Buffer posts above are the source of truth, so
  // a logging failure must never report successful posts as failed.
  let id = "unsaved";
  try {
    const db = getAdminFirestore();
    const doc = await db.collection(SOCIAL_POSTS_COLLECTION).add({
      source: input.source,
      contentId: input.contentId,
      contentLabel: input.contentLabel,
      videoUrl: input.videoUrl,
      timing: input.timing,
      platforms: input.platforms,
      results,
      status,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    });
    id = doc.id;
  } catch (e) {
    console.error("[social/schedule] audit write failed (posts already sent):", e instanceof Error ? e.message : e);
  }

  return { id, status, results };
}

/** Recent social_posts for the admin activity log. */
export async function getRecentSocialPosts(limit = 25) {
  const db = getAdminFirestore();
  const snap = await db
    .collection(SOCIAL_POSTS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
