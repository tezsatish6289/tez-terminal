#!/usr/bin/env node
/**
 * Cloud Run Job entrypoint: render ONE topic's MP4 in the cloud and publish it.
 *
 * This is the server-side equivalent of the local `npm run fetch && npm run
 * render:*` flow. It runs inside the Docker image built from this `video/`
 * package (headless Chromium + ffmpeg baked in), reads its parameters from env
 * (set per-execution by the trigger API), and:
 *
 *   1. fetches fresh props  (BASE_URL → fnoninja.com/api/freedombot/levels)
 *   2. renders the Remotion composition to an MP4
 *   3. uploads the MP4 to Firebase Storage with a permanent download-token URL
 *   4. writes progress/result to Firestore `video_renders/{RENDER_ID}` so the
 *      admin UI can poll it
 *
 * Required env:
 *   RENDER_ID        unique id for this render (also the Firestore doc id)
 *   TOPIC_ID         topic id (e.g. "put-wall") — for the status doc / labels
 *   COMPOSITION_ID   Remotion composition id (e.g. "ClusterPut")
 *   PROPS_FILE       props json path written by fetch (e.g. "out/put.json")
 *   OUTPUT_FILE      mp4 output path (e.g. "out/put-cluster.mp4")
 * Optional env:
 *   BASE_URL         data source (default https://fnoninja.com)
 *   SOURCE           storage grouping (default "videos")
 *   GOOGLE_CLOUD_PROJECT / RENDER_VIDEO_BUCKET / autoPost flags
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const VIDEO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = {
  renderId: process.env.RENDER_ID,
  // "topic" → put/call cluster video (fetch fnoninja API); "sr-story" → SR-audit
  // success-story reel (read one event from Firestore).
  kind: process.env.RENDER_KIND ?? "topic",
  topicId: process.env.TOPIC_ID ?? "unknown",
  storyId: process.env.STORY_ID,
  compositionId: process.env.COMPOSITION_ID,
  propsFile: process.env.PROPS_FILE,
  outputFile: process.env.OUTPUT_FILE,
  baseUrl: process.env.BASE_URL ?? "https://fnoninja.com",
  source: process.env.SOURCE ?? "videos",
  projectId:
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined,
  bucketName: process.env.RENDER_VIDEO_BUCKET?.trim() || undefined,
};

const COLLECTION = "video_renders";

function fail(msg) {
  console.error(`[cloud-render] FATAL: ${msg}`);
}

/** Run a shell command in the video dir, streaming output; resolve exit code + tail. */
function run(command) {
  return new Promise((resolve) => {
    console.log(`[cloud-render] $ ${command}`);
    let log = "";
    const append = (chunk) => {
      const s = chunk.toString();
      process.stdout.write(s);
      log += s;
      if (log.length > 20_000) log = log.slice(-20_000);
    };
    const child = spawn("bash", ["-lc", command], { cwd: VIDEO_DIR });
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (e) => resolve({ code: null, log: `${log}\n${e.message}` }));
    child.on("close", (code) => resolve({ code, log }));
  });
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: applicationDefault(),
    projectId: env.projectId,
  });
}

const db = () => getFirestore(adminApp());

async function setStatus(patch) {
  try {
    await db()
      .collection(COLLECTION)
      .doc(env.renderId)
      .set(
        { topicId: env.topicId, source: env.source, updatedAt: new Date().toISOString(), ...patch },
        { merge: true },
      );
  } catch (e) {
    fail(`status write failed: ${e?.message ?? e}`);
  }
}

async function readProps() {
  try {
    return JSON.parse(await readFile(join(VIDEO_DIR, env.propsFile), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Persist a compact, caption-ready summary (no candle arrays) to Firestore so
 * the web app can generate captions on prod — it has no access to the props
 * file we just fetched inside this container. Mirrors build-topic-summary.ts.
 */
async function publishTopicProps(raw) {
  if (!raw) return;
  const variant = raw.variant ?? (env.topicId.includes("call") ? "call" : "put");
  const stocks = (Array.isArray(raw.stocks) ? raw.stocks : []).map((s) => ({
    symbol: s.symbol ?? "",
    label: s.label ?? s.symbol ?? "",
    spot: s.spot ?? null,
    zoneState: s.zoneState ?? null,
    putClusterSize: s.putClusterSize ?? null,
    putClusterStrike: s.putClusterStrike ?? null,
    callClusterSize: s.callClusterSize ?? null,
    callClusterStrike: s.callClusterStrike ?? null,
    maxPain: s.maxPain ?? null,
    atmIV: s.atmIV ?? null,
    contextTag: s.contextTag ?? null,
  }));
  try {
    await db()
      .collection("video_props")
      .doc(env.topicId)
      .set({
        topicId: env.topicId,
        variant,
        dateLabel: raw.dateLabel ?? "",
        generatedAtLabel: raw.generatedAtLabel ?? null,
        stocks,
        updatedAt: new Date().toISOString(),
      });
  } catch (e) {
    fail(`props publish failed: ${e?.message ?? e}`);
  }
}

/** Upload the MP4 with a Firebase download-token URL (matches src/lib/social/video-storage.ts). */
async function uploadMp4(localPath) {
  const storage = getStorage(adminApp());
  const bucket = env.bucketName
    ? storage.bucket(env.bucketName)
    : storage.bucket(`${env.projectId}.firebasestorage.app`);
  const safe = (s) =>
    (s || "video").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "video";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `social-videos/${safe(env.source)}/${safe(env.topicId)}-${ts}.mp4`;
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination: path,
    resumable: false,
    metadata: {
      contentType: "video/mp4",
      cacheControl: "public, max-age=86400",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { url, path, bucket: bucket.name };
}

async function main() {
  if (!env.renderId || !env.compositionId || !env.propsFile || !env.outputFile) {
    fail("Missing required env (RENDER_ID, COMPOSITION_ID, PROPS_FILE, OUTPUT_FILE).");
    process.exit(1);
  }

  console.log(`[cloud-render] render ${env.renderId} kind=${env.kind} topic=${env.topicId} story=${env.storyId ?? "-"} comp=${env.compositionId}`);
  await setStatus({ status: "rendering", startedAt: new Date().toISOString(), error: null, url: null });

  let stockCount = null;
  if (env.kind === "sr-story") {
    // 1. Build props for one success story straight from Firestore.
    if (!env.storyId) {
      await setStatus({ status: "failed", reason: "BAD_INPUT", error: "STORY_ID is required for sr-story renders." });
      process.exit(1);
    }
    const fetched = await run(`STORY_ID=${env.storyId} OUT_FILE=${env.propsFile} node scripts/fetch-sr-story.mjs`);
    if (fetched.code === 2) {
      await setStatus({ status: "failed", reason: "NO_DATA", error: "No candle snapshot stored for this story yet." });
      process.exit(0);
    }
    if (fetched.code !== 0) {
      await setStatus({ status: "failed", reason: "FETCH_FAILED", error: "Story data fetch failed.", log: fetched.log.slice(-4000) });
      process.exit(1);
    }
    const props = await readProps();
    stockCount = Array.isArray(props?.candles) ? props.candles.length : null;
  } else {
    // 1. Fetch fresh put/call data from the public API.
    const fetched = await run(`BASE_URL=${env.baseUrl} node scripts/fetch-from-api.mjs`);
    if (fetched.code !== 0) {
      await setStatus({ status: "failed", reason: "FETCH_FAILED", error: "Data fetch failed.", log: fetched.log.slice(-4000) });
      process.exit(1);
    }
    // 2. Guard empty data — never render an intro-only video.
    const props = await readProps();
    stockCount = Array.isArray(props?.stocks) ? props.stocks.length : null;
    if (stockCount === 0) {
      await setStatus({ status: "failed", reason: "NO_DATA", stockCount: 0, error: "No qualifying stocks for this topic right now." });
      process.exit(0);
    }
    // Publish the caption-ready summary so the web app can caption on prod.
    await publishTopicProps(props);
  }

  // 3. Render.
  const rendered = await run(
    `npx remotion render ${env.compositionId} ${env.outputFile} --props=${env.propsFile} --log=verbose`,
  );
  if (rendered.code !== 0) {
    await setStatus({ status: "failed", reason: "RENDER_FAILED", stockCount, error: `Render failed (exit ${rendered.code}).`, log: rendered.log.slice(-4000) });
    process.exit(1);
  }

  // 4. Upload + publish URL.
  try {
    const { url, path, bucket } = await uploadMp4(join(VIDEO_DIR, env.outputFile));
    await setStatus({ status: "ready", stockCount, url, path, bucket, finishedAt: new Date().toISOString() });
    console.log(`[cloud-render] DONE → ${url}`);
  } catch (e) {
    await setStatus({ status: "failed", reason: "UPLOAD_FAILED", stockCount, error: e?.message ?? "Upload failed." });
    process.exit(1);
  }
}

main().catch(async (e) => {
  fail(e?.stack ?? e?.message ?? String(e));
  await setStatus({ status: "failed", reason: "CRASH", error: e?.message ?? "Render crashed." });
  process.exit(1);
});
