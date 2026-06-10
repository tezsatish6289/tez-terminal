/** IST formatting — always use Asia/Kolkata (never manual +5.5h + local TZ). */

const IST = "Asia/Kolkata";

/** `YYYY-MM-DD` calendar date in IST. */
export function istCalendarDateKey(isoOrMs: string | number, nowFallback?: number): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ms)) {
    if (nowFallback != null) return istCalendarDateKey(nowFallback);
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(ms));
}

/** Human-readable IST timestamp for dashboards. */
export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return `${pick("day")} ${pick("month")} ${pick("hour")}:${pick("minute")} IST`;
}
