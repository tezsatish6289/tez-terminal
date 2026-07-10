"use client";

import { useState, useEffect, useCallback } from "react";
import type { Tier } from "@/lib/entitlements";

export interface SubscriptionState {
  status: "trial" | "active" | "expired" | "loading";
  tier: Tier | null;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  showHours: boolean;
  planCode: string | null;
  autoRenew: boolean | null;
  startDate: string | null;
  trialEndDate: string | null;
  subscriptionEndDate: string | null;
  isLoading: boolean;
  refresh: () => void;
}

export function useSubscription(
  uid: string | null | undefined,
  profile?: { name?: string | null; email?: string | null; photo?: string | null }
): SubscriptionState {
  const [state, setState] = useState<Omit<SubscriptionState, "refresh" | "isLoading"> & { isLoading: boolean }>({
    status: "loading",
    tier: null,
    isTrial: false,
    isActive: false,
    isExpired: false,
    daysRemaining: 0,
    hoursRemaining: 0,
      showHours: false,
      planCode: null,
      autoRenew: null,
      startDate: null,
      trialEndDate: null,
      subscriptionEndDate: null,
      isLoading: true,
    });

  const fetchStatus = useCallback(async () => {
    if (!uid) {
      setState({
        status: "loading",
        tier: null,
        isTrial: false,
        isActive: false,
        isExpired: false,
        daysRemaining: 0,
        hoursRemaining: 0,
        showHours: false,
        planCode: null,
        autoRenew: null,
        startDate: null,
        trialEndDate: null,
        subscriptionEndDate: null,
        isLoading: false,
      });
      return;
    }

    try {
      const params = new URLSearchParams({ uid });
      if (profile?.name) params.set("name", profile.name);
      if (profile?.email) params.set("email", profile.email);
      if (profile?.photo) params.set("photo", profile.photo);
      const res = await fetch(`/api/subscription/status?${params}`);
      if (!res.ok) throw new Error("Failed to fetch subscription status");
      const data = await res.json();

      setState({
        status: data.status,
        tier: data.tier ?? null,
        isTrial: data.isTrial,
        isActive: data.isActive,
        isExpired: data.isExpired,
        daysRemaining: data.daysRemaining,
        hoursRemaining: data.hoursRemaining ?? 0,
        showHours: data.showHours ?? false,
        planCode: data.planCode ?? null,
        autoRenew: data.autoRenew ?? null,
        startDate: data.startDate ?? null,
        trialEndDate: data.trialEndDate,
        subscriptionEndDate: data.subscriptionEndDate,
        isLoading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [uid, profile?.name, profile?.email, profile?.photo]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { ...state, refresh: fetchStatus };
}
