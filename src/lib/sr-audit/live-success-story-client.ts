/** Client-safe constants / helpers for live success-story alerts (no server-only imports). */

export const LIVE_SUCCESS_STORIES_RTDB_PATH = "live_alerts/success_stories";

/** Show toast only for alerts newer than this window. */
export const LIVE_SUCCESS_STORY_TOAST_WINDOW_MS = 60 * 60 * 1000;

export const LIVE_SUCCESS_STORY_DISMISSED_KEY = "fno_success_story_dismissed_v1";

export interface LiveSuccessStoryAlertClient {
  eventId: string;
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
  at: string;
  chatMessageId?: string | null;
}

export function readDismissedStoryIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LIVE_SUCCESS_STORY_DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function rememberDismissedStoryId(eventId: string): void {
  if (typeof window === "undefined") return;
  const set = readDismissedStoryIds();
  set.add(eventId);
  // Cap growth — keep newest ~80 ids
  const list = [...set].slice(-80);
  try {
    localStorage.setItem(LIVE_SUCCESS_STORY_DISMISSED_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function isAlertFresh(atIso: string, now = Date.now()): boolean {
  const t = Date.parse(atIso);
  if (!Number.isFinite(t)) return false;
  return now - t <= LIVE_SUCCESS_STORY_TOAST_WINDOW_MS;
}
