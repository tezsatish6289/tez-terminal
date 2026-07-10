import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { requireAdmin, SUPER_ADMIN_EMAIL } from "@/lib/admin-auth";
import { getCustomerPaymentTotals } from "@/lib/zoho/billing";
import type { SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

type AdminTier = "none" | "free" | "silver" | "gold" | "daypass";

const PLAN_CODE_BY_TIER: Record<Exclude<AdminTier, "none" | "free">, string> = {
  silver: "fnoninja_silver",
  gold: "fnoninja_gold",
  daypass: "daypass",
};

/**
 * PATCH /api/admin/fnoninja-users/[uid]
 *  - { action: "update", tier, expiryDate }  → manual plan/expiry override
 *  - { action: "sync-payments" }             → pull paid totals from Zoho and cache
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { uid } = await ctx.params;
  const db = getAdminFirestore();
  const subRef = db.collection("subscriptions").doc(uid);

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      tier?: AdminTier;
      expiryDate?: string;
    };

    if (body.action === "sync-payments") {
      const subSnap = await subRef.get();
      const userSnap = await db.collection("users").doc(uid).get();
      const customerId =
        (subSnap.data()?.zohoCustomerId as string) ||
        (userSnap.data()?.zohoCustomerId as string) ||
        "";
      if (!customerId) {
        return NextResponse.json(
          { error: "No Zoho customer linked to this user yet (never checked out)." },
          { status: 400 },
        );
      }
      const totals = await getCustomerPaymentTotals(customerId);
      await subRef.set(
        {
          totalPaidInr: totals.totalPaidInr,
          paymentCount: totals.paymentCount,
          lastPaymentAt: totals.lastPaymentAt,
          paymentsSyncedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return NextResponse.json({ ok: true, ...totals });
    }

    // Default: manual plan/expiry override.
    const tier = body.tier;
    if (!tier || !["none", "free", "silver", "gold", "daypass"].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const update: Partial<SubscriptionDoc> & Record<string, unknown> = {
      userId: uid,
      manualOverride: true,
      manualOverrideAt: nowIso,
      manualOverrideBy: auth.decoded.email ?? auth.decoded.uid,
    };

    if (tier === "none") {
      update.status = "expired";
      update.tier = null;
      update.subscriptionEndDate = new Date(0).toISOString();
    } else if (tier === "free") {
      if (!body.expiryDate) return NextResponse.json({ error: "expiryDate required" }, { status: 400 });
      update.status = "trial";
      update.tier = "free";
      update.trialEndDate = new Date(body.expiryDate).toISOString();
      update.subscriptionEndDate = null;
    } else {
      if (!body.expiryDate) return NextResponse.json({ error: "expiryDate required" }, { status: 400 });
      update.status = "active";
      update.tier = tier;
      update.planCode = PLAN_CODE_BY_TIER[tier];
      update.subscriptionEndDate = new Date(body.expiryDate).toISOString();
      update.autoRenew = false; // manual grants never auto-renew
    }

    // Ensure createdAt/trial fields exist for brand-new docs.
    const existing = await subRef.get();
    if (!existing.exists) {
      update.createdAt = nowIso;
      if (!update.trialStartDate) update.trialStartDate = nowIso;
      if (!update.trialEndDate) update.trialEndDate = nowIso;
    }

    await subRef.set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Admin FnoNinja Users PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/fnoninja-users/[uid]
 * Full local wipe (for testing): Firebase Auth user + Firestore docs
 * (users, subscriptions, chat_members). Does NOT touch Zoho billing.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { uid } = await ctx.params;
  if (uid === auth.decoded.uid) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    // Guard: never delete the super-admin, whatever their uid.
    const userSnap = await db.collection("users").doc(uid).get();
    const targetEmail = userSnap.data()?.email as string | undefined;
    if (targetEmail && targetEmail === SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "Refusing to delete the super-admin account." }, { status: 400 });
    }

    await getAdminAuth()
      .deleteUser(uid)
      .catch((e: any) => {
        // auth/user-not-found is fine — continue wiping Firestore.
        if (e?.code !== "auth/user-not-found") throw e;
      });

    await Promise.all([
      db.collection("users").doc(uid).delete(),
      db.collection("subscriptions").doc(uid).delete(),
      db.collection("chat_members").doc(uid).delete(),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Admin FnoNinja Users DELETE]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
