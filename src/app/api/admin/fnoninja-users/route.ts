import { NextRequest, NextResponse } from "next/server";
import { SCORE_ALERT_PREFS_COLLECTION } from "@/lib/alerts/constants";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  isTrialActivated,
  parseTrialActivitySummary,
  TRIAL_ACTIVITY_COLLECTION,
} from "@/lib/fnoninja/trial-activity";
import { readStoredPhone } from "@/lib/phone";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export interface FnoAdminUserRow {
  uid: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  photoURL: string | null;
  joinedAt: string | null;
  lastSeenAt: string | null;
  planName: string;
  planCode: string | null;
  tier: string | null;
  status: "trial" | "active" | "expired" | "none";
  isActive: boolean;
  /** Score alerts toggle currently on (`score_alert_preferences.enabled`). */
  alertsEnabled: boolean;
  /** Met activation aha: chart + (watchlist or alerts). */
  trialActivated: boolean;
  expiryDate: string | null;
  autoRenew: boolean | null;
  manualOverride: boolean;
  zohoCustomerId: string | null;
  // Cached payment totals (from the last "Sync from Zoho"; null until synced).
  totalPaidInr: number | null;
  paymentCount: number | null;
  lastPaymentAt: string | null;
  paymentsSyncedAt: string | null;
}

function planLabel(sub: SubscriptionDoc | null): string {
  if (!sub) return "—";
  if (sub.status === "trial") return "Free trial";
  const code = sub.planCode;
  const tier = sub.tier;
  if (code === "fnoninja_gold" || tier === "gold") return "Gold";
  if (code === "fnoninja_silver" || tier === "silver") return "Silver";
  if (code === "daypass" || tier === "daypass") return "Day Pass";
  return "—";
}

function effectiveStatus(sub: SubscriptionDoc | null): FnoAdminUserRow["status"] {
  if (!sub) return "none";
  const active = isSubscriptionActive(sub);
  if (sub.status === "trial") return active ? "trial" : "expired";
  if (sub.status === "active") return active ? "active" : "expired";
  return "expired";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getAdminFirestore();
    const [usersSnap, subsSnap, alertPrefsSnap, activitySnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("subscriptions").get(),
      db.collection(SCORE_ALERT_PREFS_COLLECTION).where("enabled", "==", true).get(),
      db.collection(TRIAL_ACTIVITY_COLLECTION).get(),
    ]);

    const subsMap = new Map<string, SubscriptionDoc & Record<string, unknown>>();
    subsSnap.docs.forEach((d) => subsMap.set(d.id, d.data() as SubscriptionDoc & Record<string, unknown>));

    const alertsEnabledUids = new Set(alertPrefsSnap.docs.map((d) => d.id));
    const activatedUids = new Set<string>();
    for (const d of activitySnap.docs) {
      const summary = parseTrialActivitySummary(d.id, d.data() as Record<string, unknown>);
      if (summary.activatedAt || isTrialActivated(summary.milestones)) {
        activatedUids.add(d.id);
      }
    }

    const rows: FnoAdminUserRow[] = [];
    usersSnap.docs.forEach((d) => {
      const u = d.data();
      const products = Array.isArray(u.products) ? (u.products as string[]) : [];
      if (!products.includes("fnoninja")) return;

      const sub = subsMap.get(d.id) ?? null;
      const active = isSubscriptionActive(sub);
      const expiryDate =
        sub?.status === "trial" ? sub?.trialEndDate ?? null : sub?.subscriptionEndDate ?? null;

      rows.push({
        uid: d.id,
        displayName: u.displayName ?? null,
        email: u.email ?? null,
        phone: readStoredPhone(u),
        photoURL: u.photoURL ?? null,
        joinedAt: u.fnoninjaJoinedAt ?? sub?.createdAt ?? null,
        lastSeenAt: u.fnoninjaLastSeenAt ?? u.lastSeenAt ?? null,
        planName: planLabel(sub),
        planCode: sub?.planCode ?? null,
        tier: sub?.tier ?? (sub?.status === "trial" ? "free" : null),
        status: effectiveStatus(sub),
        isActive: active,
        alertsEnabled: alertsEnabledUids.has(d.id),
        trialActivated: activatedUids.has(d.id),
        expiryDate,
        autoRenew: sub?.autoRenew ?? null,
        manualOverride: Boolean((sub as Record<string, unknown> | null)?.manualOverride),
        zohoCustomerId: sub?.zohoCustomerId ?? (u.zohoCustomerId as string) ?? null,
        totalPaidInr:
          typeof (sub as Record<string, unknown> | null)?.totalPaidInr === "number"
            ? ((sub as Record<string, unknown>).totalPaidInr as number)
            : null,
        paymentCount:
          typeof (sub as Record<string, unknown> | null)?.paymentCount === "number"
            ? ((sub as Record<string, unknown>).paymentCount as number)
            : null,
        lastPaymentAt: (sub as Record<string, unknown> | null)?.lastPaymentAt as string ?? null,
        paymentsSyncedAt: (sub as Record<string, unknown> | null)?.paymentsSyncedAt as string ?? null,
      });
    });

    rows.sort((a, b) => {
      const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bt - at;
    });

    const activeCount = rows.filter((r) => r.isActive).length;
    const activeWithAlerts = rows.filter((r) => r.isActive && r.alertsEnabled).length;

    return NextResponse.json({
      users: rows,
      total: rows.length,
      alertStats: {
        activeWithAlerts,
        activeCount,
        activeWithAlertsPct:
          activeCount > 0 ? Math.round((activeWithAlerts / activeCount) * 100) : 0,
      },
    });
  } catch (error: any) {
    console.error("[Admin FnoNinja Users]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
