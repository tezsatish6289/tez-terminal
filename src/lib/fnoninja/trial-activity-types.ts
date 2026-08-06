/**
 * Client-safe trial activity types (mirrors server list without firebase-admin).
 */

export const TRIAL_ACTIVATION_DEFINITION =
  "chart_opened AND (favslide_added OR alerts_enabled)" as const;

export const TRIAL_ACTIVITY_TYPES = [
  "trial_started",
  "session_seen",
  "map_opened",
  "chart_opened",
  "favslide_added",
  "liveslide_opened",
  "alerts_enabled",
  "atlas_opened",
  "chat_joined",
  "phone_verified",
  "subscribe_viewed",
  "plan_selected",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "upgrade_prompt_open",
  "upgrade_prompt_cta",
  "upgrade_prompt_dismiss",
] as const;

export type TrialActivityType = (typeof TRIAL_ACTIVITY_TYPES)[number];

export type TrialMilestones = Partial<Record<TrialActivityType, string>>;

export function isTrialActivated(milestones: TrialMilestones): boolean {
  if (!milestones.chart_opened) return false;
  return Boolean(milestones.favslide_added || milestones.alerts_enabled);
}
