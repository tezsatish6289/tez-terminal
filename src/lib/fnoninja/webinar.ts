/**
 * FNONINJA free webinar — schedule, copy, and calendar-invite helpers.
 *
 * Sessions (IST, fixed UTC+05:30):
 *   · Monday    9:00 PM
 *   · Wednesday 9:00 PM
 *   · Sunday   11:00 AM
 *
 * Compliance: educational session only — no profit / returns language.
 */

export const WEBINAR_PATH = "/webinar";
export const WEBINAR_PUBLIC_URL = "https://fnoninja.com/webinar";

const IST_OFFSET_MIN = 5 * 60 + 30;
export const WEBINAR_DURATION_MIN = 60;

export const WEBINAR_SCHEDULE_LABEL = "Mon & Wed · 9 PM IST · Sun · 11 AM IST";

export const WEBINAR_TITLE = "FNONINJA Free Webinar — Reading Option Walls & Key Levels";
export const WEBINAR_SHORT_TITLE = "FNONINJA Free Webinar (1 hr)";
export const WEBINAR_TAGLINE =
  "A free 1-hour live session — Monday & Wednesday at 9 PM IST, Sunday at 11 AM IST.";

export const WEBINAR_DESCRIPTION =
  "A free, beginner-friendly live session on how to read option-chain market structure — " +
  "support & resistance zones, max-pain, and open-interest walls — and how to build a simple, " +
  "rule-based plan around those levels using FNONINJA. Educational only; not investment advice.";

export const WEBINAR_LEARN_POINTS: string[] = [
  "How to read option-chain support & resistance zones",
  "What max-pain and open-interest walls reveal about positioning",
  "Building a simple, rule-based plan around key levels",
  "Using the FNONINJA live market map in your daily routine",
  "Live Q&A — bring your questions",
];

/**
 * Where attendees actually join — a scheduled YouTube Live URL.
 * Set NEXT_PUBLIC_WEBINAR_YOUTUBE_URL to the channel's live/scheduled watch URL
 * (e.g. https://www.youtube.com/@fnoninja/live). Falls back to the webinar page.
 */
export const WEBINAR_JOIN_URL =
  process.env.NEXT_PUBLIC_WEBINAR_YOUTUBE_URL?.trim() || WEBINAR_PUBLIC_URL;
export const WEBINAR_HAS_YOUTUBE = Boolean(
  process.env.NEXT_PUBLIC_WEBINAR_YOUTUBE_URL?.trim(),
);

/** 0 = Sun … 6 = Sat */
interface WebinarSlot {
  weekday: number;
  hour: number;
  minute: number;
}

const WEBINAR_SLOTS: WebinarSlot[] = [
  { weekday: 1, hour: 21, minute: 0 },
  { weekday: 3, hour: 21, minute: 0 },
  { weekday: 0, hour: 11, minute: 0 },
];

export interface WebinarSession {
  start: Date;
  end: Date;
  istDate: string;
}

function istParts(now: Date): { y: number; m: number; d: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
}

function istWeekdayForDate(y: number, m: number, d: number): number {
  const ist = new Date(Date.UTC(y, m, d, 12, 0, 0) - IST_OFFSET_MIN * 60_000 + IST_OFFSET_MIN * 60_000);
  return ist.getUTCDay();
}

function startMsForIstSlot(y: number, m: number, d: number, hour: number, minute: number): number {
  return Date.UTC(y, m, d, hour, minute, 0) - IST_OFFSET_MIN * 60_000;
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

/** The next upcoming session on the Mon / Wed / Sun schedule. */
export function getNextWebinarSession(now: Date = new Date()): WebinarSession {
  const { y, m, d } = istParts(now);
  let bestMs = Infinity;

  for (let offset = 0; offset < 21; offset++) {
    const cal = new Date(Date.UTC(y, m, d + offset));
    const yy = cal.getUTCFullYear();
    const mo = cal.getUTCMonth();
    const dy = cal.getUTCDate();
    const wd = istWeekdayForDate(yy, mo, dy);

    for (const slot of WEBINAR_SLOTS) {
      if (slot.weekday !== wd) continue;
      const startMs = startMsForIstSlot(yy, mo, dy, slot.hour, slot.minute);
      if (startMs <= now.getTime()) continue;
      if (startMs < bestMs) bestMs = startMs;
    }
  }

  if (bestMs === Infinity) {
    const fallback = startMsForIstSlot(y, m, d + 7, 21, 0);
    return sessionFromStartMs(fallback);
  }
  return sessionFromStartMs(bestMs);
}

/** Rebuild a session from its IST date key (YYYY-MM-DD) using that weekday's slot. */
export function getWebinarSessionByIstDate(istDate: string): WebinarSession | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(istDate.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const wd = istWeekdayForDate(y, m, d);
  const slot = WEBINAR_SLOTS.find((s) => s.weekday === wd);
  if (!slot) return null;
  const startMs = startMsForIstSlot(y, m, d, slot.hour, slot.minute);
  return sessionFromStartMs(startMs);
}

/** The next `count` sessions on the recurring schedule. */
export function getUpcomingWebinarSessions(
  count: number,
  now: Date = new Date(),
): WebinarSession[] {
  const out: WebinarSession[] = [];
  const seen = new Set<string>();
  let cursor = now;

  while (out.length < count) {
    const next = getNextWebinarSession(cursor);
    const key = `${next.istDate}@${next.start.getTime()}`;
    if (seen.has(key)) break;
    seen.add(key);
    out.push(next);
    cursor = new Date(next.start.getTime() + 60_000);
  }
  return out;
}

function toCalendarUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

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
