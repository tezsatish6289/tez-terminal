/**
 * Daily loss cap: block new entries for the rest of the UTC day without
 * turning off autoTradeEnabled (FreedomBot stays "Live"; resumes after midnight UTC).
 */

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isDailyLossHaltedToday(
  data: Record<string, unknown> | undefined | null,
  now = new Date(),
): boolean {
  if (!data) return false;
  const halted = data.dailyLossHaltedUtcDate;
  return typeof halted === "string" && halted === utcDateKey(now);
}

export function isStaleDailyLossHalt(
  data: Record<string, unknown> | undefined | null,
  now = new Date(),
): boolean {
  if (!data) return false;
  const halted = data.dailyLossHaltedUtcDate;
  return typeof halted === "string" && halted < utcDateKey(now);
}

export function dailyLossHaltPatchForToday(now = new Date()): {
  dailyLossHaltedUtcDate: string;
} {
  return { dailyLossHaltedUtcDate: utcDateKey(now) };
}

export function clearDailyLossHaltPatch(): { dailyLossHaltedUtcDate: null } {
  return { dailyLossHaltedUtcDate: null };
}
