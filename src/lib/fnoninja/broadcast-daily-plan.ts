/**
 * Per-night "show plan" for the live broadcast. The nightly stream captures the
 * same page every night, so to keep it from reading as a repetitive loop (a
 * reach/quality risk on YouTube) we vary the *structure* and surface the
 * *date/session context* prominently. Everything here is derived deterministically
 * from the IST calendar day so the page and the streamer agree without coordination.
 */
const TZ = "Asia/Kolkata";

export interface BroadcastDailyPlan {
  /** 0=Sun … 6=Sat (IST). */
  weekday: number;
  /** "Fri 19 Jun 2026" */
  dateLabel: string;
  /** Short context line shown on screen, e.g. "Friday · Weekly wrap positioning". */
  sessionLabel: string;
  /** Big, bold thumbnail headline, e.g. "TUE CLOSE" / "WEEKLY WRAP". */
  thumbnailTitle: string;
  /** Compact date for thumbnails / subtitles, e.g. "19 Jun". */
  shortDateLabel: string;
  /** Whether IST today is a market weekday (Mon–Fri). */
  isMarketDay: boolean;
  /** Branded bubble-map opener duration (ms) — varies by weekday so pacing differs. */
  openerMs: number;
  /** How far to rotate the stock slideshow order so the first symbol differs nightly. */
  rotateBy: number;
  /** Accent colour of the night (subtle nightly visual change). */
  accent: string;
}

const ACCENTS = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];

/** IST parts for a given instant. */
function istParts(d: Date): { weekday: number; dateLabel: string; dayOfMonth: number } {
  const weekdayName = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dateLabel = d.toLocaleDateString("en-IN", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const dayOfMonth = Number(
    d.toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" }),
  );
  return { weekday: weekdayMap[weekdayName] ?? 0, dateLabel, dayOfMonth };
}

const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Opener length (ms) per weekday — Tue/Thu lead with a longer map opener. */
const OPENER_MS_BY_WEEKDAY: Record<number, number> = {
  0: 4 * 60_000, // Sun
  1: 4 * 60_000, // Mon
  2: 6 * 60_000, // Tue — longer map opener
  3: 4 * 60_000, // Wed
  4: 6 * 60_000, // Thu — longer map opener
  5: 3 * 60_000, // Fri — shorter, gets to names faster
  6: 4 * 60_000, // Sat
};

function sessionLabelFor(weekday: number): string {
  const day = WEEKDAY_FULL[weekday];
  if (weekday === 5) return `${day} · Weekly wrap positioning`;
  if (weekday === 0) return `${day} · Week-ahead setup`;
  if (weekday === 6) return `${day} · Weekend recap`;
  return `${day} · Post-close positioning`;
}

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Big bold thumbnail headline per weekday. */
function thumbnailTitleFor(weekday: number): string {
  if (weekday === 5) return "WEEKLY WRAP";
  if (weekday === 0) return "WEEK AHEAD";
  if (weekday === 6) return "WEEKEND RECAP";
  return `${WEEKDAY_SHORT[weekday]} CLOSE`;
}

export function getBroadcastDailyPlan(now: Date = new Date()): BroadcastDailyPlan {
  const { weekday, dateLabel, dayOfMonth } = istParts(now);
  const isMarketDay = weekday >= 1 && weekday <= 5;
  const shortDateLabel = now.toLocaleDateString("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
  });
  return {
    weekday,
    dateLabel,
    sessionLabel: sessionLabelFor(weekday),
    thumbnailTitle: thumbnailTitleFor(weekday),
    shortDateLabel,
    isMarketDay,
    openerMs: OPENER_MS_BY_WEEKDAY[weekday] ?? 4 * 60_000,
    // dayOfMonth gives a stable nightly rotation that wanders through the list.
    rotateBy: dayOfMonth,
    accent: ACCENTS[dayOfMonth % ACCENTS.length]!,
  };
}

/** Rotate an array left by n (non-mutating). Keeps content, changes the lead item. */
export function rotateList<T>(list: T[], n: number): T[] {
  if (list.length <= 1) return list;
  const k = ((n % list.length) + list.length) % list.length;
  if (k === 0) return list;
  return [...list.slice(k), ...list.slice(0, k)];
}
