import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import {
  getSubscriptionTier,
  isSubscriptionActive,
  type SubscriptionDoc,
} from "@/lib/subscription";
import { hasFeature, type EntitlementContext, type Feature } from "@/lib/entitlements";

/**
 * Loads the server-side entitlement context for a user from Firestore.
 * `isAuthenticated` is true because callers must verify the Firebase token first.
 * Access is ultimately gated by the subscription end dates (stale statuses are
 * handled by `isSubscriptionActive`).
 */
export async function loadEntitlementContext(uid: string): Promise<EntitlementContext> {
  const snap = await getAdminFirestore().collection("subscriptions").doc(uid).get();
  const sub = snap.exists ? (snap.data() as SubscriptionDoc) : null;
  return {
    tier: getSubscriptionTier(sub),
    isActive: isSubscriptionActive(sub),
    isAuthenticated: true,
  };
}

/** Server-side feature check for a verified uid. */
export async function userHasFeature(uid: string, feature: Feature): Promise<boolean> {
  return hasFeature(feature, await loadEntitlementContext(uid));
}
