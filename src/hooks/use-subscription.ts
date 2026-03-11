"use client";

import { useState, useEffect, useCallback } from "react";

export interface SubscriptionState {
  status: "trial" | "active" | "expired" | "loading";
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  daysRemaining: number;
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
    isTrial: false,
    isActive: false,
    isExpired: false,
    daysRemaining: 0,
    trialEndDate: null,
    subscriptionEndDate: null,
    isLoading: true,
  });

  const fetchStatus = useCallback(async () => {
    if (!uid) {
      setState({
        status: "loading",
        isTrial: false,
        isActive: false,
        isExpired: false,
        daysRemaining: 0,
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
        isTrial: data.isTrial,
        isActive: data.isActive,
        isExpired: data.isExpired,
        daysRemaining: data.daysRemaining,
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
