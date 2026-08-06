import type { TrialMilestones } from "@/lib/fnoninja/trial-activity-types";
import { TRIAL_ACTIVATION_DEFINITION } from "@/lib/fnoninja/trial-activity-types";

export { TRIAL_ACTIVATION_DEFINITION };

export type TrialCohort = "active_trial" | "expired_trial" | "paid" | "other";

export interface TrialInsightUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string | null;
  lastSeenAt: string | null;
  status: string;
  tier: string | null;
  planName: string;
  isActive: boolean;
  cohort: TrialCohort;
  milestones: TrialMilestones;
  activatedAt: string | null;
  activated: boolean;
  sessionCount: number;
  eventCount: number;
  alertsEnabled: boolean;
  favslideCount: number;
  hot: boolean;
  cold: boolean;
}

export interface TrialFunnelStats {
  started: number;
  activated: number;
  returnedD2: number;
  subscribeViewed: number;
  paymentInitiated: number;
  paid: number;
  activationRatePct: number;
  paidFromTrialPct: number;
}

export interface MilestoneDriverRow {
  milestone: keyof TrialMilestones | "activated";
  label: string;
  withMilestone: number;
  converted: number;
  convertRatePct: number;
}

export interface TrialInsightsPayload {
  activationDefinition: typeof TRIAL_ACTIVATION_DEFINITION;
  generatedAt: string;
  funnel: TrialFunnelStats;
  drivers: MilestoneDriverRow[];
  hotTrials: TrialInsightUser[];
  coldTrials: TrialInsightUser[];
  users: TrialInsightUser[];
}
