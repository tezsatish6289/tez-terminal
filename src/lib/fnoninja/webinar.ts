/**
 * FNONINJA free webinar — schedule, copy, and calendar-invite helpers.
 *
 * The webinar runs DAILY at 20:00 IST (8:00 PM) for 60 minutes. IST has no DST
 * and is a fixed UTC+05:30 offset, so all scheduling is plain epoch math.
 *
 * Compliance: this is an educational session. Copy here intentionally avoids any
 * profit / returns / guaranteed-income language (SEBI finfluencer rules + YouTube
 * financial-services policy). Keep it skill- and process-focused.
 */

export const WEBINAR_PATH = "/webinar";
export const WEBINAR_PUBLIC_URL = "https://fnoninja.com/webinar";

/** IST is a fixed UTC+05:30 offset. */
const IST_OFFSET_MIN = 5 * 60 + 30;
/** Daily start, in IST wall-clock. */
const WEBINAR_START_HOUR_IST = 20; // 8:00 PM
const WEBINAR_START_MIN_IST = 0;
export const WEBINAR_DURATION_MIN = 60;

export const WEBINAR_TITLE = "FNONINJA Free Webinar — Reading Option Walls & Key Levels";
export const WEBINAR_SHORT_TITLE = "FNONINJA Free Webinar (1 hr)";
export const WEBINAR_TAGLINE = "A free 1-hour live session, every evening at 8 PM IST.";

export const WEBINAR_DESCRIPTION =
  "A free, beginner-friendly live session on how to read option-chain market structure — " +
  "support & resistance zones, max-pain, and open-interest walls — and how to build a simple, " +
  "rule-based plan around those levels using FNONINJA. Educational only; not investment advice.";

/** What attendees will learn — skill/process framed, no outcome claims. */
export const WEBINAR_LEARN_POINTS: string[] = [
  "How to read option-chain support & resistance zones",
  "What max-pain and open-interest walls reveal about positioning",
  "Building a simple, rule-based plan around key levels",
  "Using the FNONINJA live market map in your daily routine",
  "Live Q&A — bring your questions",
];

/**
 * Where attendees join. Until a dedicated meeting link is provisioned, this
 * points at the webinar page (which will host/redirect to the live room).
 */
export const WEBINAR_JOIN_URL = WEBINAR_PUBLIC_URL;

export interface WebinarSession {
  /** Session start instant. */
  start: Date;
  /** Session end instant. */
  end: Date;
  /** ISO date of the session in IST, e.g. "2026-06-19" — stable session key. */
  istDate: string;
}

function istParts(now: Date): { y: number; m: number; d: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
}

/** UTC epoch (ms) for the webinar start on the given IST calendar date. */
function startMsForIstDate(y: number, m: number, d: number): number {
  return (
    Date.UTC(y, m, d, WEBINAR_START_HOUR_IST, WEBINAR_START_MIN_IST, 0) -
    IST_OFFSET_MIN * 60_000
  );
}

function istDateKey(startMs: number): string {
  const ist = new Date(startMs + IST_OFFSET_MIN * 60_000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sessionFromStartMs(startMs: number): WebinarSession {
  return {
    start: new Date(startMs),
    end: new Date(startMs + WEBINAR_DURATION_MIN * 60_000),
    istDate: istDateKey(startMs),
  };
}

/**
 * The next upcoming session. If today's 8 PM IST has already started, returns
 * tomorrow's session.
 */
export function getNextWebinarSession(now: Date = new Date()): WebinarSession {
  const { y, m, d } = istParts(now);
  let startMs = startMsForIstDate(y, m, d);
  if (now.getTime() >= startMs) {
    startMs = startMsForIstDate(y, m, d + 1); // Date.UTC normalises overflow
  }
  return sessionFromStartMs(startMs);
}

/** The next `count` sessions (today/tomorrow onward), one per day. */
export function getUpcomingWebinarSessions(
  count: number,
  now: Date = new Date(),
): WebinarSession[] {
  const first = getNextWebinarSession(now);
  const out: WebinarSession[] = [];
  for (let i = 0; i < count; i++) {
    const startMs = first.start.getTime() + i * 24 * 60 * 60 * 1000;
    out.push(sessionFromStartMs(startMs));
  }
  return out;
}

/** UTC basic format for calendar links: YYYYMMDDTHHMMSSZ. */
function toCalendarUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "Add to Google Calendar" deep link for a session. */
export function googleCalendarUrl(session: WebinarSession): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: WEBINAR_TITLE,
    dates: `${toCalendarUtc(session.start)}/${toCalendarUtc(session.end)}`,
    details: `${WEBINAR_DESCRIPTION}\n\nJoin: ${WEBINAR_JOIN_URL}`,
    location: WEBINAR_JOIN_URL,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 .ics body for a session (Apple Calendar / Outlook). */
export function buildWebinarIcs(session: WebinarSession): string {
  const uid = `fnoninja-webinar-${session.istDate}@fnoninja.com`;
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FNONINJA//Webinar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toCalendarUtc(new Date())}`,
    `DTSTART:${toCalendarUtc(session.start)}`,
    `DTEND:${toCalendarUtc(session.end)}`,
    `SUMMARY:${escape(WEBINAR_TITLE)}`,
    `DESCRIPTION:${escape(`${WEBINAR_DESCRIPTION}\n\nJoin: ${WEBINAR_JOIN_URL}`)}`,
    `LOCATION:${escape(WEBINAR_JOIN_URL)}`,
    `URL:${WEBINAR_JOIN_URL}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Human label for a session, e.g. "Thu, 19 Jun · 8:00 PM IST". */
export function formatWebinarSession(session: WebinarSession): string {
  const fmt = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return `${fmt.format(session.start)} IST`;
}
