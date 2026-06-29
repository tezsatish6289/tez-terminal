/**
 * Trigger + track cloud renders (Cloud Run Job).
 *
 * Rendering a Remotion video needs headless Chromium + ffmpeg and takes minutes
 * — too heavy for the serverless web app. In production we kick off a Cloud Run
 * Job (built from the `video/` package, see video/Dockerfile) that renders,
 * uploads the MP4 to Firebase Storage, and writes progress to the
 * `video_renders/{renderId}` Firestore doc the admin UI polls.
 *
 * Config (env, set in apphosting.yaml):
 *   VIDEO_RENDER_JOB      Cloud Run Job name (presence = cloud rendering enabled)
 *   VIDEO_RENDER_REGION   job region (default us-central1)
 *   VIDEO_RENDER_PROJECT  project id (defaults to the app's project)
 */

import "server-only";
import { GoogleAuth } from "google-auth-library";
import { getAdminFirestore } from "@/firebase/admin";
import type { VideoTopic } from "./topics";

export const VIDEO_RENDERS_COLLECTION = "video_renders";

export type RenderStatusValue = "queued" | "rendering" | "ready" | "failed";

export interface RenderStatusDoc {
  status: RenderStatusValue;
  topicId?: string;
  source?: string;
  url?: string | null;
  path?: string | null;
  bucket?: string | null;
  stockCount?: number | null;
  reason?: string | null;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  createdBy?: string | null;
}

function jobConfig() {
  const job = process.env.VIDEO_RENDER_JOB?.trim();
  const region = process.env.VIDEO_RENDER_REGION?.trim() || "us-central1";
  const project =
    process.env.VIDEO_RENDER_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "studio-6235588950-a15f2";
  return { job, region, project };
}

/** True when a Cloud Run Job is wired up (otherwise we fall back to local-only). */
export function cloudRenderConfigured(): boolean {
  return Boolean(process.env.VIDEO_RENDER_JOB?.trim());
}

let _auth: GoogleAuth | null = null;
function auth(): GoogleAuth {
  if (!_auth) {
    _auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  return _auth;
}

/** Start a Cloud Run Job execution with the given per-run env overrides. */
async function startJob(envVars: { name: string; value: string }[]): Promise<void> {
  const { job, region, project } = jobConfig();
  if (!job) throw new Error("Cloud renderer not configured (VIDEO_RENDER_JOB unset).");
  const client = await auth().getClient();
  const url = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${encodeURIComponent(job)}:run`;
  await client.request({
    url,
    method: "POST",
    data: { overrides: { containerOverrides: [{ env: envVars }] } },
  });
}

async function createRenderDoc(renderId: string, doc: Partial<RenderStatusDoc>): Promise<void> {
  const nowIso = new Date().toISOString();
  await getAdminFirestore()
    .collection(VIDEO_RENDERS_COLLECTION)
    .doc(renderId)
    .set({ status: "queued", url: null, createdAt: nowIso, updatedAt: nowIso, ...doc } satisfies RenderStatusDoc);
}

export interface TriggerInput {
  topic: VideoTopic;
  baseUrl: string;
  source?: string;
  createdBy?: string;
}

/**
 * Put/call topic render. Creates the status doc + starts a Cloud Run Job
 * execution. Returns the renderId the UI should poll.
 */
export async function triggerCloudRender(input: TriggerInput): Promise<string> {
  if (!cloudRenderConfigured()) throw new Error("Cloud renderer not configured (VIDEO_RENDER_JOB unset).");
  const source = input.source ?? "videos";
  const renderId = `${input.topic.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  await createRenderDoc(renderId, { topicId: input.topic.id, source, createdBy: input.createdBy ?? null });
  await startJob([
    { name: "RENDER_ID", value: renderId },
    { name: "RENDER_KIND", value: "topic" },
    { name: "TOPIC_ID", value: input.topic.id },
    { name: "COMPOSITION_ID", value: input.topic.compositionId },
    { name: "PROPS_FILE", value: input.topic.propsFile },
    { name: "OUTPUT_FILE", value: input.topic.outputFile },
    { name: "BASE_URL", value: input.baseUrl },
    { name: "SOURCE", value: source },
  ]);
  return renderId;
}

export interface StoryTriggerInput {
  storyId: string;
  createdBy?: string;
}

/**
 * SR-audit success-story render. The job reads the event + candle snapshot from
 * Firestore directly (no admin HTTP auth needed) and renders the WinStory
 * composition. Returns the renderId the UI should poll.
 */
export async function triggerStoryRender(input: StoryTriggerInput): Promise<string> {
  if (!cloudRenderConfigured()) throw new Error("Cloud renderer not configured (VIDEO_RENDER_JOB unset).");
  const renderId = `story-${input.storyId}-${Date.now().toString(36)}`;

  await createRenderDoc(renderId, { topicId: input.storyId, source: "sr-audit", createdBy: input.createdBy ?? null });
  await startJob([
    { name: "RENDER_ID", value: renderId },
    { name: "RENDER_KIND", value: "sr-story" },
    { name: "STORY_ID", value: input.storyId },
    { name: "COMPOSITION_ID", value: "WinStory" },
    { name: "PROPS_FILE", value: "out/sr-story.json" },
    { name: "OUTPUT_FILE", value: "out/sr-story.mp4" },
    { name: "SOURCE", value: "sr-audit" },
  ]);
  return renderId;
}

export async function readRenderStatus(renderId: string): Promise<RenderStatusDoc | null> {
  const snap = await getAdminFirestore()
    .collection(VIDEO_RENDERS_COLLECTION)
    .doc(renderId)
    .get();
  return snap.exists ? (snap.data() as RenderStatusDoc) : null;
}
