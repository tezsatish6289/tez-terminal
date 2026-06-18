/**
 * Server-side Google OAuth — refresh-token flow for YouTube + Calendar APIs.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export async function getGoogleAccessToken(
  config: GoogleOAuthConfig = getGoogleOAuthConfig()!,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `Token refresh failed (${res.status})`);
  }
  return data.access_token;
}

export async function googleGet<T>(accessToken: string, url: string): Promise<T> {
  return googleRequest<T>(accessToken, "GET", url);
}

export async function googlePost<T>(accessToken: string, url: string, body: unknown): Promise<T> {
  return googleRequest<T>(accessToken, "POST", url, body);
}

export async function googlePatch<T>(accessToken: string, url: string, body: unknown): Promise<T> {
  return googleRequest<T>(accessToken, "PATCH", url, body);
}

export async function googleDelete(accessToken: string, url: string): Promise<void> {
  await googleRequest(accessToken, "DELETE", url);
}

async function googleRequest<T>(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = data as { error?: { message?: string } | string };
    const msg =
      typeof err.error === "string"
        ? err.error
        : err.error?.message ?? `Google API error (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
}

/** Returns the authorized account's YouTube channel (must be channel owner/manager). */
export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannelInfo | null> {
  const data = await googleGet<{
    items?: Array<{ id: string; snippet?: { title?: string } }>;
  }>(accessToken, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");

  const item = data.items?.[0];
  if (!item?.id) return null;
  return { id: item.id, title: item.snippet?.title ?? item.id };
}

/**
 * Verifies the `calendar.events` scope by reading events on the primary calendar.
 * NOTE: we intentionally do NOT request the broader `calendar`/`calendar.readonly`
 * scopes, so listing calendars (calendarList) is not available — only event access.
 */
export async function verifyCalendarEventsAccess(accessToken: string): Promise<boolean> {
  await googleGet(
    accessToken,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1",
  );
  return true;
}

export interface GoogleOAuthHealthCheck {
  ok: true;
  youtube: YouTubeChannelInfo;
  calendarEventsAccess: boolean;
}

/** End-to-end sanity check: refresh token → YouTube channel + Calendar events access. */
export async function runGoogleOAuthHealthCheck(
  config?: GoogleOAuthConfig,
): Promise<GoogleOAuthHealthCheck> {
  const cfg = config ?? getGoogleOAuthConfig();
  if (!cfg) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REFRESH_TOKEN");
  }

  const accessToken = await getGoogleAccessToken(cfg);
  const youtube = await fetchYouTubeChannel(accessToken);
  if (!youtube) {
    throw new Error("YouTube API returned no channel — wrong Google account or missing youtube.force-ssl scope");
  }

  const calendarEventsAccess = await verifyCalendarEventsAccess(accessToken);

  return { ok: true, youtube, calendarEventsAccess };
}
