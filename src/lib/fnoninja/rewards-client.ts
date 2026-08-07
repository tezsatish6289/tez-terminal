import type { User } from "firebase/auth";
import type { FnoExperienceValue } from "@/lib/fnoninja/rewards-shared";

/** Browser event so toolbar balance can refresh after an earn. */
export const FNO_DIAMONDS_CHANGED_EVENT = "fno-diamonds-changed";

export function notifyDiamondsChanged(balance: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FNO_DIAMONDS_CHANGED_EVENT, { detail: { balance } }),
  );
}

export type RewardsApiSummary = {
  diamonds: number;
  diamondsLifetimeEarned: number;
  rewardsDaysExtended: number;
  fnoExperience: FnoExperienceValue | null;
  quests: {
    fnoExperience: { done: boolean; available: boolean };
    chatMessage: { doneToday: boolean; available: boolean };
    pnlShare: { doneToday: boolean; available: boolean };
    welcome: { label: string; available: boolean };
  };
  ledger: {
    id: string;
    type: "earn" | "redeem";
    quest: string;
    amount: number;
    at: string;
  }[];
};

export type PersonaEarnResult = {
  awarded: boolean;
  amount: number;
  balance: number;
  daysExtendedThisEarn: number;
  totalDaysExtended: number;
  experience: FnoExperienceValue;
  reason?: string;
};

async function authHeaders(user: User): Promise<HeadersInit> {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchRewardsSummary(user: User): Promise<RewardsApiSummary> {
  const res = await fetch("/api/fnoninja/rewards", {
    headers: await authHeaders(user),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to load rewards");
  }
  return (await res.json()) as RewardsApiSummary;
}

export async function submitPersonaExperience(
  user: User,
  experience: FnoExperienceValue,
): Promise<PersonaEarnResult> {
  const res = await fetch("/api/fnoninja/rewards/persona", {
    method: "POST",
    headers: await authHeaders(user),
    body: JSON.stringify({ experience }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to save");
  }
  return (await res.json()) as PersonaEarnResult;
}
