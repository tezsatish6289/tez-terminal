import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { SCORE_ALERT_PREFS_COLLECTION } from "@/lib/alerts/constants";
import {
  normalizeScoreAlertPreferencesPatch,
  parseScoreAlertPreferences,
  withClampedScoreAlertMinScore,
} from "@/lib/alerts/prefs";
import { requireUser } from "@/lib/chat/require-user";
import { hasFeature } from "@/lib/entitlements";
import { loadEntitlementContext } from "@/lib/entitlements-server";
import { trackTrialActivity } from "@/lib/fnoninja/trial-activity";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/fnoninja/alerts/preferences
 * Score-alert prefs for the signed-in FNO user.
 * Min score ≥80 requires Gold / Day Pass (`score_alerts_80`).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [snap, ctx] = await Promise.all([
    getAdminFirestore().collection(SCORE_ALERT_PREFS_COLLECTION).doc(auth.decoded.uid).get(),
    loadEntitlementContext(auth.decoded.uid),
  ]);

  const preferences = withClampedScoreAlertMinScore(
    parseScoreAlertPreferences(snap.data()),
    hasFeature("score_alerts_80", ctx),
  );

  return NextResponse.json({ preferences });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(SCORE_ALERT_PREFS_COLLECTION).doc(auth.decoded.uid);
  const [snap, ctx] = await Promise.all([ref.get(), loadEntitlementContext(auth.decoded.uid)]);
  const canUseGoldFloor = hasFeature("score_alerts_80", ctx);
  const current = withClampedScoreAlertMinScore(
    parseScoreAlertPreferences(snap.data()),
    canUseGoldFloor,
  );
  const next = normalizeScoreAlertPreferencesPatch(body, current);
  if ("error" in next) {
    return NextResponse.json({ error: next.error }, { status: 400 });
  }

  if (next.minScore >= 80 && !canUseGoldFloor) {
    return NextResponse.json(
      {
        error: "Score floor ≥80 requires Gold",
        code: "upgrade_required",
        feature: "score_alerts_80",
      },
      { status: 403 },
    );
  }

  const clamped = withClampedScoreAlertMinScore(next, canUseGoldFloor);
  await ref.set(clamped, { merge: true });
  if (clamped.enabled && !current.enabled) {
    trackTrialActivity(db, auth.decoded.uid, "alerts_enabled", {
      minScore: clamped.minScore,
      segment: clamped.segment,
    });
  }
  return NextResponse.json({ preferences: clamped });
}
