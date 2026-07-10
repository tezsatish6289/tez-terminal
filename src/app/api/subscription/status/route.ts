import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  FNONINJA_FREE_TRIAL_DAYS,
  FREE_TRIAL_DAYS,
  getSubscriptionHoursRemaining,
  getSubscriptionTier,
  shouldShowHoursRemaining,
  type SubscriptionDoc,
} from "@/lib/subscription";
import { syncChatAccess } from "@/lib/chat/access";

export const dynamic = "force-dynamic";

/**
 * GET /api/subscription/status?uid=...
 * Returns the user's subscription status. Creates a trial if none exists.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const name = searchParams.get("name");
    const email = searchParams.get("email");
    const photo = searchParams.get("photo");

    const db = getAdminFirestore();

    if (name || email) {
      const profileData: Record<string, string> = {};
      if (name) profileData.displayName = name;
      if (email) profileData.email = email;
      if (photo) profileData.photoURL = photo;
      profileData.lastSeenAt = new Date().toISOString();
      await db.collection("users").doc(uid).set(profileData, { merge: true });
    }

    const product = searchParams.get("product");
    const trialDays = product === "fnoninja" ? FNONINJA_FREE_TRIAL_DAYS : FREE_TRIAL_DAYS;

    const subRef = db.collection("subscriptions").doc(uid);
    let subSnap = await subRef.get();
    let trialJustActivated = false;

    if (!subSnap.exists) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

      const newSub: SubscriptionDoc = {
        userId: uid,
        status: "trial",
        tier: "free",
        trialStartDate: now.toISOString(),
        trialEndDate: trialEnd.toISOString(),
        subscriptionEndDate: null,
        createdAt: now.toISOString(),
      };

      await subRef.set(newSub);
      subSnap = await subRef.get();
      trialJustActivated = true;
    }

    const data = subSnap.data() as SubscriptionDoc;
    const now = Date.now();

    let effectiveStatus = data.status;
    if (data.status === "trial" && new Date(data.trialEndDate).getTime() <= now) {
      effectiveStatus = "expired";
      await subRef.update({ status: "expired" });
    } else if (
      data.status === "active" &&
      data.subscriptionEndDate &&
      new Date(data.subscriptionEndDate).getTime() <= now
    ) {
      effectiveStatus = "expired";
      await subRef.update({ status: "expired" });
    }

    const endDate =
      effectiveStatus === "trial"
        ? data.trialEndDate
        : data.subscriptionEndDate;

    const startDate =
      effectiveStatus === "trial"
        ? data.trialStartDate
        : data.subscriptionStartDate ?? data.createdAt ?? null;

    let daysRemaining = 0;
    if (endDate) {
      daysRemaining = Math.max(
        0,
        Math.ceil((new Date(endDate).getTime() - now) / (1000 * 60 * 60 * 24))
      );
    }

    // Keep the community-chat access mirror in sync with subscription state.
    // trial/active => can chat; expired => cannot. Best-effort; never blocks
    // the status response.
    const canChat = effectiveStatus === "trial" || effectiveStatus === "active";
    void syncChatAccess(uid, canChat, { displayName: name, email, photoURL: photo }).catch(
      (e) => console.error("[Subscription Status] chat access sync failed", e)
    );

    // Evaluate tier/hours against the *effective* status (the stored status may be stale).
    const effectiveSub: SubscriptionDoc = { ...data, status: effectiveStatus };
    const tier = getSubscriptionTier(effectiveSub);

    return NextResponse.json({
      status: effectiveStatus,
      tier,
      isTrial: effectiveStatus === "trial",
      isActive: effectiveStatus === "trial" || effectiveStatus === "active",
      isExpired: effectiveStatus === "expired",
      daysRemaining,
      hoursRemaining: getSubscriptionHoursRemaining(effectiveSub),
      showHours: shouldShowHoursRemaining(effectiveSub),
      planCode: data.planCode ?? null,
      autoRenew: data.autoRenew ?? null,
      startDate,
      trialEndDate: data.trialEndDate,
      subscriptionEndDate: data.subscriptionEndDate,
      trialJustActivated,
    });
  } catch (error: any) {
    console.error("[Subscription Status]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
