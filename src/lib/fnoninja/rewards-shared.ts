/**
 * Client-safe rewards constants and labels (no server imports).
 */

export const DIAMONDS_PER_QUEST = 10;
export const DIAMONDS_PER_DAY = 50;

export const FNO_EXPERIENCE_OPTIONS = [
  { value: "never", label: "Never traded F&O" },
  { value: "lt_1y", label: "Less than 1 year" },
  { value: "1_3y", label: "1–3 years" },
  { value: "3_5y", label: "3–5 years" },
  { value: "gt_5y", label: "5+ years" },
] as const;

export type FnoExperienceValue = (typeof FNO_EXPERIENCE_OPTIONS)[number]["value"];

export function questLabel(quest: string): string {
  if (quest === "fno_experience") return "F&O experience";
  if (quest === "auto_redeem") return "Access day unlocked";
  if (quest.startsWith("chat_message_")) return "Daily chat";
  if (quest.startsWith("pnl_share_")) return "PnL screenshot";
  if (quest.startsWith("welcome_")) return "Welcomed a new member";
  return quest;
}
