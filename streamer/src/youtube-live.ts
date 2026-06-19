/**
 * YouTube Live control for the nightly broadcast — create + bind a broadcast,
 * let FFmpeg auto-start/stop it, set the thumbnail, and clean up.
 *
 * Reuses the same refresh-token OAuth flow as the webinar integration.
 * Required env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 * GOOGLE_OAUTH_REFRESH_TOKEN.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

export async function getAccessToken(): Promise<string> {
  const clientId = required("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = required("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = required("GOOGLE_OAUTH_REFRESH_TOKEN");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function ytFetch<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } }).error?.message ?? `YouTube API ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export interface BroadcastOptions {
  title: string;
  description: string;
  privacy: "public" | "unlisted" | "private";
  startIso: string;
  endIso: string;
}

/** Creates a broadcast that auto-starts when ingestion is healthy and auto-stops when it ends. */
export async function createBroadcast(token: string, opts: BroadcastOptions): Promise<string> {
  const data = await ytFetch<{ id: string }>(
    token,
    "POST",
    "/liveBroadcasts?part=snippet,status,contentDetails",
    {
      snippet: {
        title: opts.title,
        description: opts.description,
        scheduledStartTime: opts.startIso,
        scheduledEndTime: opts.endIso,
      },
      status: {
        privacyStatus: opts.privacy,
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        latencyPreference: "normal",
        monitorStream: { enableMonitorStream: false },
      },
    },
  );
  return data.id;
}

export interface StreamInfo {
  streamId: string;
  ingestionAddress: string;
  streamName: string;
}

/** Creates a reusable RTMP ingestion endpoint at the given resolution/fps. */
export async function createStream(token: string, resolution: string, fps: string): Promise<StreamInfo> {
  const data = await ytFetch<{
    id: string;
    cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } };
  }>(token, "POST", "/liveStreams?part=snippet,cdn,contentDetails", {
    snippet: { title: `FNONINJA nightly ${new Date().toISOString()}` },
    cdn: {
      ingestionType: "rtmp",
      resolution,
      // YouTube expects an enum: "30fps" | "60fps" | "variable".
      frameRate: /fps$/.test(fps) ? fps : `${fps}fps`,
    },
    contentDetails: { isReusable: true },
  });
  return {
    streamId: data.id,
    ingestionAddress: data.cdn.ingestionInfo.ingestionAddress,
    streamName: data.cdn.ingestionInfo.streamName,
  };
}

export async function bindBroadcast(token: string, broadcastId: string, streamId: string): Promise<void> {
  await ytFetch(token, "POST", `/liveBroadcasts/bind?id=${broadcastId}&part=id,contentDetails&streamId=${streamId}`);
}

/** Best-effort transition to complete (enableAutoStop usually handles this). */
export async function completeBroadcast(token: string, broadcastId: string): Promise<void> {
  try {
    await ytFetch(token, "POST", `/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=id,status`);
  } catch (err) {
    console.warn("[yt] complete transition skipped:", err instanceof Error ? err.message : err);
  }
}

export async function setThumbnail(token: string, videoId: string, jpeg: Buffer): Promise<void> {
  const res = await fetch(`${UPLOAD_API}/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: jpeg,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Thumbnail set failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function deleteResource(token: string, kind: "liveBroadcasts" | "liveStreams", id: string): Promise<void> {
  const res = await fetch(`${API}/${kind}?id=${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.warn(`[yt] delete ${kind} ${id} failed (${res.status}): ${text.slice(0, 120)}`);
  }
}

export function watchUrl(broadcastId: string): string {
  return `https://www.youtube.com/watch?v=${broadcastId}`;
}
