/**
 * Google Calendar — create the webinar event and add registrants as guests.
 *
 * Uses the `calendar.events` scope only. Events are created on the authorized
 * account's primary calendar (the FNO NINJA Google account) unless
 * GOOGLE_CALENDAR_ID overrides it.
 */
import { googleGet, googlePatch, googlePost } from "./oauth";
import {
  WEBINAR_DESCRIPTION,
  WEBINAR_JOIN_URL,
  WEBINAR_TITLE,
  type WebinarSession,
} from "@/lib/fnoninja/webinar";

const CALENDAR_TZ = "Asia/Kolkata";

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
}

function eventsUrl(extra = ""): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events${extra}`;
}

export interface CalendarEvent {
  id: string;
  htmlLink?: string;
}

interface RawCalendarEvent {
  id: string;
  htmlLink?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}

/** Creates the webinar event with email + popup reminders. Returns its id. */
export async function createWebinarCalendarEvent(
  accessToken: string,
  session: WebinarSession,
  joinUrl: string = WEBINAR_JOIN_URL,
): Promise<CalendarEvent> {
  const body = {
    summary: WEBINAR_TITLE,
    description: `${WEBINAR_DESCRIPTION}\n\nJoin: ${joinUrl}`,
    location: joinUrl,
    start: { dateTime: session.start.toISOString(), timeZone: CALENDAR_TZ },
    end: { dateTime: session.end.toISOString(), timeZone: CALENDAR_TZ },
    // Keep attendee emails private from one another.
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 60 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const event = await googlePost<RawCalendarEvent>(accessToken, eventsUrl(), body);
  return { id: event.id, htmlLink: event.htmlLink };
}

/**
 * Adds a registrant as a guest on the event and emails them the invite.
 * Reads current attendees first, then patches (Calendar has no atomic add).
 */
export async function addGuestToWebinarEvent(
  accessToken: string,
  eventId: string,
  email: string,
  displayName?: string,
): Promise<void> {
  const current = await googleGet<RawCalendarEvent>(
    accessToken,
    eventsUrl(`/${encodeURIComponent(eventId)}`),
  );

  const attendees = current.attendees ?? [];
  const normalized = email.toLowerCase().trim();
  if (attendees.some((a) => a.email.toLowerCase() === normalized)) {
    return; // already a guest
  }

  attendees.push({ email: normalized, displayName });

  await googlePatch(
    accessToken,
    eventsUrl(`/${encodeURIComponent(eventId)}?sendUpdates=all`),
    { attendees },
  );
}

/** Returns true if the event still exists on the calendar. */
export async function webinarEventExists(accessToken: string, eventId: string): Promise<boolean> {
  try {
    await googleGet(accessToken, eventsUrl(`/${encodeURIComponent(eventId)}`));
    return true;
  } catch {
    return false;
  }
}
