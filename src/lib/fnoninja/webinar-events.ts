/**
 * Per-session webinar infrastructure orchestration.
 *
 * For each session (keyed by IST date) we lazily provision:
 *   · a scheduled YouTube Live broadcast (so viewers can set a reminder), and
 *   · a Google Calendar event (so registrants get a real invite + reminders).
 *
 * Registrants are then added as guests on the calendar event. All Google calls
 * are best-effort: a failure here must never block the lead capture itself.
 */
import { getAdminFirestore } from "@/firebase/admin";
import { getGoogleAccessToken, getGoogleOAuthConfig } from "@/lib/google/oauth";
import { createWebinarCalendarEvent, addGuestToWebinarEvent } from "@/lib/google/calendar";
import { createScheduledBroadcast } from "@/lib/google/youtube";
import { WEBINAR_JOIN_URL, type WebinarSession } from "@/lib/fnoninja/webinar";

const COLLECTION = "webinarEvents";

export interface WebinarEventInfra {
  istDate: string;
  calendarEventId: string | null;
  calendarHtmlLink: string | null;
  youtubeBroadcastId: string | null;
  youtubeWatchUrl: string | null;
}

interface WebinarEventDoc extends WebinarEventInfra {
  startIso?: string;
  endIso?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function isGoogleSyncEnabled(): boolean {
  return getGoogleOAuthConfig() !== null;
}

/**
 * Ensures the YouTube broadcast + Calendar event exist for a session.
 * Creates whatever is missing and persists ids to Firestore. Best-effort.
 */
async function ensureWebinarInfra(
  accessToken: string,
  session: WebinarSession,
): Promise<WebinarEventInfra> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(session.istDate);
  const snap = await ref.get();
  const data = (snap.data() ?? {}) as WebinarEventDoc;

  let youtubeBroadcastId = data.youtubeBroadcastId ?? null;
  let youtubeWatchUrl = data.youtubeWatchUrl ?? null;
  let calendarEventId = data.calendarEventId ?? null;
  let calendarHtmlLink = data.calendarHtmlLink ?? null;

  const updates: Record<string, unknown> = {};

  if (!youtubeBroadcastId) {
    try {
      const b = await createScheduledBroadcast(accessToken, session);
      youtubeBroadcastId = b.id;
      youtubeWatchUrl = b.watchUrl;
      updates.youtubeBroadcastId = b.id;
      updates.youtubeWatchUrl = b.watchUrl;
    } catch (err) {
      console.warn(`[webinar-events] YouTube broadcast create failed for ${session.istDate}:`, err);
    }
  }

  if (!calendarEventId) {
    try {
      const joinUrl = youtubeWatchUrl ?? WEBINAR_JOIN_URL;
      const ev = await createWebinarCalendarEvent(accessToken, session, joinUrl);
      calendarEventId = ev.id;
      calendarHtmlLink = ev.htmlLink ?? null;
      updates.calendarEventId = ev.id;
      updates.calendarHtmlLink = ev.htmlLink ?? null;
    } catch (err) {
      console.warn(`[webinar-events] Calendar event create failed for ${session.istDate}:`, err);
    }
  }

  if (!snap.exists || Object.keys(updates).length > 0) {
    const now = new Date().toISOString();
    await ref.set(
      {
        istDate: session.istDate,
        startIso: session.start.toISOString(),
        endIso: session.end.toISOString(),
        ...updates,
        ...(snap.exists ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    );
  }

  return { istDate: session.istDate, calendarEventId, calendarHtmlLink, youtubeBroadcastId, youtubeWatchUrl };
}

/**
 * Registers a guest for a session: provisions infra (if needed) and adds the
 * person to the calendar event. Never throws — returns infra or null on failure.
 */
export async function syncRegistrationToGoogle(
  session: WebinarSession,
  email: string,
  name?: string,
): Promise<WebinarEventInfra | null> {
  if (!isGoogleSyncEnabled()) return null;

  try {
    const accessToken = await getGoogleAccessToken();
    const infra = await ensureWebinarInfra(accessToken, session);

    if (infra.calendarEventId) {
      try {
        await addGuestToWebinarEvent(accessToken, infra.calendarEventId, email, name);
      } catch (err) {
        console.warn(`[webinar-events] add guest failed for ${session.istDate}:`, err);
      }
    }

    return infra;
  } catch (err) {
    console.warn("[webinar-events] Google sync failed:", err);
    return null;
  }
}

/** Returns stored infra for a set of session dates (admin view). */
export async function getWebinarEventInfraMap(
  istDates: string[],
): Promise<Record<string, WebinarEventInfra>> {
  if (istDates.length === 0) return {};
  const db = getAdminFirestore();
  const out: Record<string, WebinarEventInfra> = {};
  const snaps = await db.getAll(
    ...istDates.map((d) => db.collection(COLLECTION).doc(d)),
  );
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const d = snap.data() as WebinarEventDoc;
    out[snap.id] = {
      istDate: snap.id,
      calendarEventId: d.calendarEventId ?? null,
      calendarHtmlLink: d.calendarHtmlLink ?? null,
      youtubeBroadcastId: d.youtubeBroadcastId ?? null,
      youtubeWatchUrl: d.youtubeWatchUrl ?? null,
    };
  }
  return out;
}
