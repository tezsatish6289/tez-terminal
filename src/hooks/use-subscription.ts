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
  /** FNONINJA: OTP-verified mobile on file. */
  phoneVerified: boolean;
  /** FNONINJA: trial hard-blocked until phone verified (past 24h grace). */
  phoneBlocksAccess: boolean;
  phoneGraceEndsAt: string | null;
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
    phoneVerified: false,
    phoneBlocksAccess: false,
    phoneGraceEndsAt: null,
    isLoading: true,
  });

  // The uid the current state was actually fetched for. Lets us treat the state
  // as "still loading" the moment `uid` changes (e.g. auth resolves) until the
  // fetch for THAT uid lands — synchronously, so no stale-state paywall flash.
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!uid) {
      setLoadedUid(null);
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
        phoneVerified: false,
        phoneBlocksAccess: false,
        phoneGraceEndsAt: null,
        isLoading: false,
      });
      return;
    }

    try {
      const params = new URLSearchParams({ uid });
      if (profile?.name) params.set("name", profile.name);
      if (profile?.email) params.set("email", profile.email);
      if (profile?.photo) params.set("photo", profile.photo);
      // FNONINJA host / path — request product-scoped trial + phone gate fields.
      if (
        typeof window !== "undefined" &&
        (window.location.hostname.includes("fnoninja") ||
          window.location.pathname.startsWith("/fnoninja"))
      ) {
        params.set("product", "fnoninja");
      }
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
        phoneVerified: data.phoneVerified === true,
        phoneBlocksAccess: data.phoneBlocksAccess === true,
        phoneGraceEndsAt: data.phoneGraceEndsAt ?? null,
        isLoading: false,
      });
      setLoadedUid(uid);
    } catch {
      // Keep prior values (don't drop an active user to the paywall on a
      // transient error) but mark this uid as attempted so we stop "loading".
      setState((prev) => ({ ...prev, isLoading: false }));
      setLoadedUid(uid);
    }
  }, [uid, profile?.name, profile?.email, profile?.photo]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Flip to "expired" exactly when access lapses, even if the user is idle on a
  // page. We know the end timestamp client-side, so schedule a re-fetch for that
  // moment rather than polling — the status route recomputes expiry on read.
  useEffect(() => {
    if (state.isLoading || !state.isActive) return;
    const endIso = state.status === "trial" ? state.trialEndDate : state.subscriptionEndDate;
    if (!endIso) return;
    const ms = new Date(endIso).getTime() - Date.now();
    if (ms <= 0) {
      fetchStatus();
      return;
    }
    // setTimeout caps at ~24.8 days (2^31-1 ms); clamp to stay safe.
    const delay = Math.min(ms + 1000, 2 ** 31 - 1);
    const t = window.setTimeout(() => fetchStatus(), delay);
    return () => window.clearTimeout(t);
  }, [state.isLoading, state.isActive, state.status, state.trialEndDate, state.subscriptionEndDate, fetchStatus]);

  // Re-validate when the tab regains focus (e.g. machine woke from sleep and the
  // scheduled timer may have drifted).
  useEffect(() => {
    if (!uid) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [uid, fetchStatus]);

  // Re-fetch on demand when another part of the app just changed entitlements
  // (e.g. the Day Pass reconciler activated a pass after payment).
  useEffect(() => {
    if (!uid) return;
    const onRefresh = () => fetchStatus();
    window.addEventListener("fnoninja:subscription-refresh", onRefresh);
    return () => window.removeEventListener("fnoninja:subscription-refresh", onRefresh);
  }, [uid, fetchStatus]);

  // Derived: authenticated but the fetch for this uid hasn't landed yet → still
  // loading. Prevents the "stale not-active" render from flashing the paywall.
  const isLoading = state.isLoading || (!!uid && loadedUid !== uid);

  return { ...state, isLoading, refresh: fetchStatus };
}
