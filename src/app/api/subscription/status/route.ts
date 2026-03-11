import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FREE_TRIAL_DAYS, type SubscriptionDoc } from "@/lib/subscription";

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

    const subRef = db.collection("subscriptions").doc(uid);
    let subSnap = await subRef.get();

    if (!subSnap.exists) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const newSub: SubscriptionDoc = {
        userId: uid,
        status: "trial",
        trialStartDate: now.toISOString(),
        trialEndDate: trialEnd.toISOString(),
        subscriptionEndDate: null,
        createdAt: now.toISOString(),
      };

      await subRef.set(newSub);
      subSnap = await subRef.get();
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

    let daysRemaining = 0;
    if (endDate) {
      daysRemaining = Math.max(
        0,
        Math.ceil((new Date(endDate).getTime() - now) / (1000 * 60 * 60 * 24))
      );
    }

    return NextResponse.json({
      status: effectiveStatus,
      isTrial: effectiveStatus === "trial",
      isActive: effectiveStatus === "trial" || effectiveStatus === "active",
      isExpired: effectiveStatus === "expired",
      daysRemaining,
      trialEndDate: data.trialEndDate,
      subscriptionEndDate: data.subscriptionEndDate,
    });
  } catch (error: any) {
    console.error("[Subscription Status]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
