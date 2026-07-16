import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import { maskPhone, readStoredPhone } from "@/lib/phone";
import {
  phoneGraceEndsAt,
  shouldBlockTrialForPhone,
  shouldSoftPromptPhone,
} from "@/lib/fnoninja/phone-verify";
import type { SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/fnoninja/phone/status
 * Auth: Bearer Firebase ID token.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const uid = auth.decoded.uid;
    const db = getAdminFirestore();
    const [userSnap, subSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("subscriptions").doc(uid).get(),
    ]);

    const userData = userSnap.data() ?? {};
    const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
    const status = sub?.status ?? "expired";
    const phoneVerified = typeof userData.phoneVerifiedAt === "string" && !!userData.phoneVerifiedAt;
    const joinedAt =
      typeof userData.fnoninjaJoinedAt === "string" ? userData.fnoninjaJoinedAt : null;
    const graceEndsAt = phoneGraceEndsAt(joinedAt).toISOString();
    const stored = readStoredPhone(userData);

    const phoneBlocksAccess = shouldBlockTrialForPhone({
      phoneVerified,
      subscriptionStatus: status,
      fnoninjaJoinedAt: joinedAt,
    });
    const softPrompt = shouldSoftPromptPhone({
      phoneVerified,
      subscriptionStatus: status,
      fnoninjaJoinedAt: joinedAt,
    });

    return NextResponse.json({
      phoneVerified,
      /** Full 10-digit mobile for the signed-in owner (profile display). */
      phone: stored,
      phoneMasked: maskPhone(stored),
      phoneGraceEndsAt: graceEndsAt,
      phoneBlocksAccess,
      softPrompt,
      subscriptionStatus: status,
      isTrial: status === "trial",
      isPaidActive: status === "active",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Phone status failed";
    console.error("[FNONINJA Phone Status]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
