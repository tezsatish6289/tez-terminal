import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  encryptPhone,
  hashPhone,
  maskPhone,
  normalizeFromFirebasePhone,
} from "@/lib/phone";
import {
  PHONE_OWNERS_COLLECTION,
  PHONE_TRIAL_CLAIMS_COLLECTION,
} from "@/lib/fnoninja/phone-verify";
import type { SubscriptionDoc } from "@/lib/subscription";
import { trackTrialActivity } from "@/lib/fnoninja/trial-activity";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/phone/verify
 * Auth: Bearer Firebase ID token (must already have phone linked via OTP).
 *
 * Reads the verified number from Firebase Auth (not the request body),
 * encrypts it on the user doc, and enforces one-phone / one-trial rules.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const uid = auth.decoded.uid;
    const adminAuth = getAdminAuth();
    const userRecord = await adminAuth.getUser(uid);
    const normalized = normalizeFromFirebasePhone(userRecord.phoneNumber ?? null);

    if (!normalized) {
      return NextResponse.json(
        {
          error:
            "No verified Indian mobile on your account yet. Complete the SMS OTP step first.",
          code: "phone_not_linked",
        },
        { status: 400 },
      );
    }

    const phoneHash = hashPhone(normalized);
    const db = getAdminFirestore();
    const now = new Date().toISOString();
    const userRef = db.collection("users").doc(uid);
    const ownerRef = db.collection(PHONE_OWNERS_COLLECTION).doc(phoneHash);
    const trialClaimRef = db.collection(PHONE_TRIAL_CLAIMS_COLLECTION).doc(phoneHash);
    const subRef = db.collection("subscriptions").doc(uid);

    const [ownerSnap, trialSnap, subSnap, userSnap] = await Promise.all([
      ownerRef.get(),
      trialClaimRef.get(),
      subRef.get(),
      userRef.get(),
    ]);

    if (ownerSnap.exists) {
      const ownerUid = ownerSnap.data()?.uid;
      if (ownerUid && ownerUid !== uid) {
        return NextResponse.json(
          {
            error: "This mobile number is already linked to another account.",
            code: "phone_owned",
          },
          { status: 409 },
        );
      }
    }

    const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
    const onTrial = sub?.status === "trial";

    // One free trial per mobile, ever. Trial users cannot verify a number that
    // already powered another account's trial. First successful verify also
    // burns the trial slot (even for paid users) so a second Google account
    // cannot farm another trial with the same SIM.
    if (trialSnap.exists) {
      const claimUid = trialSnap.data()?.uid;
      if (claimUid && claimUid !== uid && onTrial) {
        return NextResponse.json(
          {
            error:
              "This mobile number was already used for a free trial. Subscribe to continue, or use a different number.",
            code: "phone_trial_used",
          },
          { status: 409 },
        );
      }
    }

    // Existing verified hash on this user with a different number — release old owner doc if ours.
    const prevHash =
      typeof userSnap.data()?.phoneHash === "string" ? (userSnap.data()?.phoneHash as string) : null;

    await db.runTransaction(async (tx) => {
      const freshOwner = await tx.get(ownerRef);
      if (freshOwner.exists) {
        const ownerUid = freshOwner.data()?.uid;
        if (ownerUid && ownerUid !== uid) {
          throw Object.assign(new Error("phone_owned"), { code: "phone_owned" });
        }
      }

      const freshClaim = await tx.get(trialClaimRef);
      if (freshClaim.exists) {
        const claimUid = freshClaim.data()?.uid;
        if (claimUid && claimUid !== uid && onTrial) {
          throw Object.assign(new Error("phone_trial_used"), { code: "phone_trial_used" });
        }
      } else {
        tx.set(trialClaimRef, { uid, claimedAt: now, phoneHash }, { merge: true });
      }

      if (prevHash && prevHash !== phoneHash) {
        const prevOwnerRef = db.collection(PHONE_OWNERS_COLLECTION).doc(prevHash);
        const prevOwner = await tx.get(prevOwnerRef);
        if (prevOwner.exists && prevOwner.data()?.uid === uid) {
          tx.delete(prevOwnerRef);
        }
      }

      tx.set(
        ownerRef,
        { uid, verifiedAt: now, phoneHash },
        { merge: true },
      );

      tx.set(
        userRef,
        {
          phoneEnc: encryptPhone(normalized),
          phoneHash,
          phoneVerifiedAt: now,
          phone: FieldValue.delete(),
        },
        { merge: true },
      );
    });

    trackTrialActivity(db, uid, "phone_verified");

    return NextResponse.json({
      ok: true,
      phoneMasked: maskPhone(normalized),
      phoneVerified: true,
    });
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (code === "phone_owned") {
      return NextResponse.json(
        {
          error: "This mobile number is already linked to another account.",
          code: "phone_owned",
        },
        { status: 409 },
      );
    }
    if (code === "phone_trial_used") {
      return NextResponse.json(
        {
          error:
            "This mobile number was already used for a free trial. Subscribe to continue, or use a different number.",
          code: "phone_trial_used",
        },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Phone verify failed";
    console.error("[FNONINJA Phone Verify]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
