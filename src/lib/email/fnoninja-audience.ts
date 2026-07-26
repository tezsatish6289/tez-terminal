/**
 * FNO Ninja marketing audience: users with product fnoninja, a usable email,
 * opted in to email updates (default on), and either currently entitled
 * (trial/active) or expired (trial or paid).
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";

export interface FnoEmailContact {
  uid: string;
  email: string;
  firstName: string | null;
}

/** Default-on: missing/undefined means opted in. */
export function isEmailUpdatesEnabled(userData: Record<string, unknown> | null | undefined): boolean {
  if (!userData) return true;
  return userData.emailUpdatesEnabled !== false;
}

function firstNameFrom(displayName: unknown, email: string): string | null {
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim().split(/\s+/)[0] ?? null;
  }
  const local = email.split("@")[0]?.trim();
  return local || null;
}

export async function listFnoNinjaEmailAudience(): Promise<FnoEmailContact[]> {
  const db = getAdminFirestore();
  const [usersSnap, subsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("subscriptions").get(),
  ]);

  const subs = new Map<string, SubscriptionDoc>();
  for (const d of subsSnap.docs) {
    subs.set(d.id, d.data() as SubscriptionDoc);
  }

  const out: FnoEmailContact[] = [];
  const seen = new Set<string>();

  for (const doc of usersSnap.docs) {
    const u = doc.data() as Record<string, unknown>;
    const products = Array.isArray(u.products) ? (u.products as string[]) : [];
    if (!products.includes("fnoninja")) continue;
    if (!isEmailUpdatesEnabled(u)) continue;

    const email = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) continue;
    if (seen.has(email)) continue;

    const sub = subs.get(doc.id) ?? null;
    if (!sub) continue;

    const active = isSubscriptionActive(sub);
    const expired =
      !active &&
      (sub.status === "expired" ||
        sub.status === "trial" ||
        sub.status === "active" ||
        Boolean(sub.trialEndDate));

    // Active trial/paid, or any expired FNO Ninja subscription/trial.
    if (!active && !expired) continue;

    seen.add(email);
    out.push({
      uid: doc.id,
      email,
      firstName: firstNameFrom(u.displayName, email),
    });
  }

  return out;
}
