import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { VideoTopic } from "./topics";

/**
 * Where the fetch step pulls live levels data from. Defaults to fnoninja.com —
 * the public host for the F&O levels (same app/Firestore behind every domain,
 * so the `/api/freedombot/levels` route returns identical data). Override with
 * VIDEO_FETCH_BASE_URL (e.g. http://localhost:9002 for local dev data).
 */
export function fetchBaseUrl(): string {
  return process.env.VIDEO_FETCH_BASE_URL ?? "https://fnoninja.com";
}

/**
 * Local-only render orchestration for the /admin/videos module.
 *
 * Rendering a Remotion video needs a headless browser + ffmpeg and takes
 * minutes — that does not belong inside the deployed serverless web app. So we
 * only run it when the admin opens this page on their local dev machine (the
 * one with the `video/` package). In production we just hand back the exact
 * command to run instead.
 */

export function videoDir(): string {
  return path.join(process.cwd(), "video");
}

/** True when this process can plausibly run the Remotion CLI locally. */
export async function canRenderLocally(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  try {
    await access(path.join(videoDir(), "package.json"));
    return true;
  } catch {
    return false;
  }
}

/** The one-liner an admin can paste to render this topic by hand. */
export function renderCommand(topic: VideoTopic, baseUrl: string): string {
  const script = `render:${topic.variant}`;
  return [
    `cd video`,
    `BASE_URL=${baseUrl} npm run fetch`,
    `npm run ${script} -- --props=${topic.propsFile}`,
  ].join(" && ");
}

export type RenderReason = "FETCH_FAILED" | "NO_DATA" | "RENDER_FAILED" | null;

export interface RenderResult {
  ok: boolean;
  reason: RenderReason;
  code: number | null;
  stockCount: number | null;
  log: string;
}

/** Run a shell command in the video dir, resolving with exit code + log tail. */
function run(command: string, cwd: string): Promise<{ code: number | null; log: string }> {
  return new Promise((resolve) => {
    let log = "";
    const append = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.length > 20_000) log = log.slice(-20_000);
    };
    const child = spawn("bash", ["-lc", command], { cwd });
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => resolve({ code: null, log: `${log}\n${err.message}` }));
    child.on("close", (code) => resolve({ code, log }));
  });
}

async function countStocks(topic: VideoTopic): Promise<number | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(videoDir(), topic.propsFile), "utf8"));
    return Array.isArray(raw?.stocks) ? raw.stocks.length : null;
  } catch {
    return null;
  }
}

/**
 * Run fetch (optional) + render for a topic, resolving when the MP4 is done.
 * Refuses to render if the fetch produced no stocks — an empty video (intro +
 * end card only) is never what we want.
 */
export async function runRender(
  topic: VideoTopic,
  opts: { baseUrl: string; refreshData: boolean },
): Promise<RenderResult> {
  const cwd = videoDir();
  let log = "";

  if (opts.refreshData) {
    const fetched = await run(`BASE_URL=${opts.baseUrl} npm run fetch`, cwd);
    log += fetched.log;
    if (fetched.code !== 0) {
      return { ok: false, reason: "FETCH_FAILED", code: fetched.code, stockCount: null, log };
    }
  }

  const stockCount = await countStocks(topic);
  if (stockCount === 0) {
    return { ok: false, reason: "NO_DATA", code: 0, stockCount: 0, log };
  }

  const rendered = await run(`npm run render:${topic.variant} -- --props=${topic.propsFile}`, cwd);
  log += rendered.log;
  return {
    ok: rendered.code === 0,
    reason: rendered.code === 0 ? null : "RENDER_FAILED",
    code: rendered.code,
    stockCount,
    log: log.length > 20_000 ? log.slice(-20_000) : log,
  };
}
