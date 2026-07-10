"use client";

import { useUser } from "@/firebase";
import { useSubscription, type SubscriptionState } from "@/hooks/use-subscription";
import {
  featureLockReason,
  hasFeature,
  type EntitlementContext,
  type Feature,
  type LockReason,
} from "@/lib/entitlements";

export interface EntitlementsResult {
  ctx: EntitlementContext;
  isLoading: boolean;
  /** True if the given feature is accessible in the current context. */
  has: (feature: Feature) => boolean;
  /** Null if accessible, else why it's locked (login / subscribe / upgrade). */
  lockReason: (feature: Feature) => LockReason | null;
  subscription: SubscriptionState;
  isAuthenticated: boolean;
}

/**
 * Client-side entitlement resolver — combines Firebase auth + subscription state
 * into the {@link EntitlementContext} the gating helpers expect.
 */
export function useEntitlements(): EntitlementsResult {
  const { user, isUserLoading } = useUser();
  const subscription = useSubscription(user?.uid);

  const ctx: EntitlementContext = {
    tier: subscription.tier,
    isActive: subscription.isActive,
    isAuthenticated: !!user,
  };

  return {
    ctx,
    isLoading: isUserLoading || subscription.isLoading,
    has: (feature) => hasFeature(feature, ctx),
    lockReason: (feature) => featureLockReason(feature, ctx),
    subscription,
    isAuthenticated: !!user,
  };
}
