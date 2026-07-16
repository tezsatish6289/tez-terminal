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
import {
  PHONE_TRIAL_CLAIMS_COLLECTION,
  phoneGraceEndsAt,
  shouldBlockTrialForPhone,
} from "@/lib/fnoninja/phone-verify";

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
    const userRef = db.collection("users").doc(uid);

    if (name || email) {
      const profileData: Record<string, string> = {};
      if (name) profileData.displayName = name;
      if (email) profileData.email = email;
      if (photo) profileData.photoURL = photo;
      profileData.lastSeenAt = new Date().toISOString();
      await userRef.set(profileData, { merge: true });
    }

    const product = searchParams.get("product");
    const trialDays = product === "fnoninja" ? FNONINJA_FREE_TRIAL_DAYS : FREE_TRIAL_DAYS;

    const subRef = db.collection("subscriptions").doc(uid);
    let subSnap = await subRef.get();
    let trialJustActivated = false;
    let trialDeniedPhoneReuse = false;

    const userSnap = await userRef.get();
    const userData = userSnap.data() ?? {};
    const products = Array.isArray(userData.products) ? userData.products : [];
    const isFnoUser = product === "fnoninja" || products.includes("fnoninja");
    const phoneVerified =
      typeof userData.phoneVerifiedAt === "string" && !!userData.phoneVerifiedAt;
    const phoneHash = typeof userData.phoneHash === "string" ? userData.phoneHash : null;
    const fnoninjaJoinedAt =
      typeof userData.fnoninjaJoinedAt === "string" ? userData.fnoninjaJoinedAt : null;

    if (!subSnap.exists) {
      // If this account already has a verified phone that powered someone else's
      // trial, do not grant a fresh free trial.
      if (phoneVerified && phoneHash) {
        const claimSnap = await db.collection(PHONE_TRIAL_CLAIMS_COLLECTION).doc(phoneHash).get();
        if (claimSnap.exists && claimSnap.data()?.uid && claimSnap.data()?.uid !== uid) {
          trialDeniedPhoneReuse = true;
          const now = new Date();
          const newSub: SubscriptionDoc = {
            userId: uid,
            status: "expired",
            tier: "free",
            trialStartDate: now.toISOString(),
            trialEndDate: now.toISOString(),
            subscriptionEndDate: null,
            createdAt: now.toISOString(),
          };
          await subRef.set(newSub);
          subSnap = await subRef.get();
        }
      }

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

        // Bind verified phone → this trial so it can't unlock another account later.
        if (phoneVerified && phoneHash) {
          await db
            .collection(PHONE_TRIAL_CLAIMS_COLLECTION)
            .doc(phoneHash)
            .set({ uid, claimedAt: now.toISOString(), phoneHash }, { merge: true });
        }
      }
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

    const phoneBlocksAccess =
      isFnoUser &&
      shouldBlockTrialForPhone({
        phoneVerified,
        subscriptionStatus: effectiveStatus,
        fnoninjaJoinedAt,
        nowMs: now,
      });

    const subscriptionActive = effectiveStatus === "trial" || effectiveStatus === "active";
    const isActive = subscriptionActive && !phoneBlocksAccess;

    // Keep the community-chat access mirror in sync with subscription state.
    // trial/active => can chat; expired => cannot. Best-effort; never blocks
    // the status response. Phone-blocked trial users keep chat during grace only.
    const canChat = isActive;
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
      isActive,
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
      phoneVerified: isFnoUser ? phoneVerified : undefined,
      phoneGraceEndsAt: isFnoUser ? phoneGraceEndsAt(fnoninjaJoinedAt, now).toISOString() : undefined,
      phoneBlocksAccess: isFnoUser ? phoneBlocksAccess : undefined,
      trialDeniedPhoneReuse: trialDeniedPhoneReuse || undefined,
    });
  } catch (error: any) {
    console.error("[Subscription Status]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
