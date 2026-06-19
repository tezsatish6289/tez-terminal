/**
 * Nightly FNONINJA broadcast streamer — single-shot controller.
 *
 * 1. Provisions a YouTube Live broadcast + RTMP stream (auto-start/stop).
 * 2. Renders the broadcast page in headless Chromium on a virtual X display.
 * 3. Pushes Xvfb video + shuffled music audio to YouTube via FFmpeg.
 * 4. Sets a thumbnail, runs for the configured duration, then tears down.
 *
 * Designed to run once per night inside the Docker image on a Linux VM.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlaylist } from "./music.ts";
import {
  bindBroadcast,
  completeBroadcast,
  createBroadcast,
  createStream,
  deleteResource,
  getAccessToken,
  setThumbnail,
  watchUrl,
} from "./youtube-live.ts";

const cfg = {
  url: process.env.BROADCAST_URL?.trim() || "https://fnoninja.com/broadcast/live?scene=live",
  width: Number(process.env.WIDTH ?? 1920),
  height: Number(process.env.HEIGHT ?? 1080),
  fps: Number(process.env.FPS ?? 30),
  videoBitrate: process.env.VIDEO_BITRATE?.trim() || "4500k",
  audioDir: process.env.AUDIO_DIR?.trim() || "/app/audio",
  durationMin: Number(process.env.DURATION_MIN ?? 60),
  warmupSec: Number(process.env.WARMUP_SEC ?? 20),
  privacy: (process.env.PRIVACY?.trim() as "public" | "unlisted" | "private") || "public",
  display: process.env.DISPLAY?.trim() || ":99",
  provisionOnly: process.env.PROVISION_ONLY === "1",
};

const procs: ChildProcess[] = [];
function track(p: ChildProcess): ChildProcess {
  procs.push(p);
  return p;
}
function killAll(): void {
  for (const p of procs) {
    if (!p.killed) {
      try { p.kill("SIGKILL"); } catch { /* ignore */ }
    }
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ytResolution(): string {
  if (cfg.height >= 1080) return "1080p";
  if (cfg.height >= 720) return "720p";
  return "480p";
}

function todayLabelIst(): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function buildTitle(): string {
  return `FNONINJA Live — Today's F&O Option Walls & Key Levels (${todayLabelIst()})`;
}

function buildDescription(): string {
  return [
    "Live option-wall map and key support/resistance levels for the NSE F&O universe.",
    "Educational market-structure visualization — not investment advice. F&O involves risk.",
    "",
    "Free webinar — reading option walls & key levels: https://fnoninja.com/webinar",
    "Live market map: https://fnoninja.com",
  ].join("\n");
}

async function main(): Promise<void> {
  console.log(`[run] FNONINJA streamer starting — url=${cfg.url} ${cfg.width}x${cfg.height}@${cfg.fps} privacy=${cfg.privacy}`);

  // ── 1. Provision YouTube ─────────────────────────────────
  const token = await getAccessToken();
  const now = new Date();
  const end = new Date(now.getTime() + cfg.durationMin * 60_000);
  const broadcastId = await createBroadcast(token, {
    title: buildTitle(),
    description: buildDescription(),
    privacy: cfg.privacy,
    startIso: now.toISOString(),
    endIso: end.toISOString(),
  });
  const stream = await createStream(token, ytResolution(), String(cfg.fps));
  await bindBroadcast(token, broadcastId, stream.streamId);
  const rtmpTarget = `${stream.ingestionAddress}/${stream.streamName}`;
  console.log(`[run] broadcast ${broadcastId} → ${watchUrl(broadcastId)}`);

  if (cfg.provisionOnly) {
    console.log(`[run] PROVISION_ONLY dry run OK — created+bound broadcast and stream.`);
    console.log(`[run]   rtmp target: ${rtmpTarget}`);
    console.log(`[run] cleaning up (deleting test broadcast + stream)…`);
    await deleteResource(token, "liveBroadcasts", broadcastId);
    await deleteResource(token, "liveStreams", stream.streamId);
    console.log("[run] cleanup done — nothing left on the channel.");
    return;
  }

  // ── 2. Music playlist ────────────────────────────────────
  const work = mkdtempSync(join(tmpdir(), "fnoninja-stream-"));
  const playlist = buildPlaylist(cfg.audioDir, join(work, "playlist.txt"));
  console.log(`[run] playlist: ${playlist.count} tracks (shuffled)`);

  // ── 3. Virtual display + browser ─────────────────────────
  track(spawn("Xvfb", [cfg.display, "-screen", "0", `${cfg.width}x${cfg.height}x24`, "-nolisten", "tcp"], {
    stdio: "ignore",
  }));
  await sleep(2000);

  const chromeFlags = [
    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--kiosk", "--start-fullscreen", "--window-position=0,0",
    `--window-size=${cfg.width},${cfg.height}`, "--force-device-scale-factor=1",
    "--disable-infobars", "--noerrdialogs", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required", "--check-for-update-interval=31536000",
    cfg.url,
  ];
  track(spawn(chromiumBin(), chromeFlags, { stdio: "ignore", env: { ...process.env, DISPLAY: cfg.display } }));
  console.log(`[run] chromium launched, warming up ${cfg.warmupSec}s…`);
  await sleep(cfg.warmupSec * 1000);

  // ── 4. Thumbnail (best-effort) ───────────────────────────
  try {
    const thumb = await captureThumbnail(work);
    await setThumbnail(token, broadcastId, thumb);
    console.log("[run] thumbnail set");
  } catch (err) {
    console.warn("[run] thumbnail skipped:", err instanceof Error ? err.message : err);
  }

  // ── 5. FFmpeg → YouTube ──────────────────────────────────
  const ff = track(spawn("ffmpeg", ffmpegArgs(playlist.path, rtmpTarget), { stdio: ["pipe", "inherit", "inherit"] }));
  console.log(`[run] streaming for ${cfg.durationMin} min…`);

  let stopped = false;
  const onSignal = () => { stopped = true; gracefulStop(ff); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  await Promise.race([
    sleep(cfg.durationMin * 60_000),
    new Promise<void>((r) => ff.on("exit", () => r())),
  ]);

  if (!stopped) gracefulStop(ff);
  await sleep(3000);

  // ── 6. Teardown ──────────────────────────────────────────
  await completeBroadcast(token, broadcastId);
  killAll();
  console.log(`[run] done — ${watchUrl(broadcastId)}`);
}

function ffmpegArgs(playlistPath: string, rtmpTarget: string): string[] {
  const gop = String(cfg.fps * 2);
  return [
    "-hide_banner", "-loglevel", "warning",
    // video: virtual display
    "-f", "x11grab", "-draw_mouse", "0", "-framerate", String(cfg.fps),
    "-video_size", `${cfg.width}x${cfg.height}`, "-i", `${cfg.display}.0`,
    // audio: shuffled playlist on infinite loop
    "-stream_loop", "-1", "-f", "concat", "-safe", "0", "-i", playlistPath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-b:v", cfg.videoBitrate, "-maxrate", cfg.videoBitrate, "-bufsize", String(parseInt(cfg.videoBitrate) * 2) + "k",
    "-g", gop, "-r", String(cfg.fps),
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
    "-f", "flv", rtmpTarget,
  ];
}

async function captureThumbnail(work: string): Promise<Buffer> {
  const out = join(work, "thumb.jpg");
  await new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "x11grab", "-video_size", `${cfg.width}x${cfg.height}`, "-i", `${cfg.display}.0`,
      "-frames:v", "1", "-q:v", "3", out,
    ], { stdio: "ignore" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`thumbnail ffmpeg exit ${code}`))));
    p.on("error", reject);
  });
  return readFileSync(out);
}

function gracefulStop(ff: ChildProcess): void {
  try { ff.stdin?.write("q"); } catch { /* ignore */ }
  setTimeout(() => { if (!ff.killed) ff.kill("SIGINT"); }, 2000);
  setTimeout(() => { if (!ff.killed) ff.kill("SIGKILL"); }, 8000);
}

function chromiumBin(): string {
  return process.env.CHROMIUM_BIN?.trim() || "chromium";
}

main().catch((err: unknown) => {
  console.error("[run] FATAL:", err instanceof Error ? err.stack ?? err.message : err);
  killAll();
  process.exit(1);
});
