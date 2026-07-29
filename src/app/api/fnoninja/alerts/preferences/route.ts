import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { SCORE_ALERT_PREFS_COLLECTION } from "@/lib/alerts/constants";
import {
  normalizeScoreAlertPreferencesPatch,
  parseScoreAlertPreferences,
} from "@/lib/alerts/prefs";
import { requireUser } from "@/lib/chat/require-user";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/fnoninja/alerts/preferences
 * Score-alert prefs for the signed-in FNO user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const snap = await getAdminFirestore()
    .collection(SCORE_ALERT_PREFS_COLLECTION)
    .doc(auth.decoded.uid)
    .get();

  return NextResponse.json({
    preferences: parseScoreAlertPreferences(snap.data()),
  });
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
  const snap = await ref.get();
  const current = parseScoreAlertPreferences(snap.data());
  const next = normalizeScoreAlertPreferencesPatch(body, current);
  if ("error" in next) {
    return NextResponse.json({ error: next.error }, { status: 400 });
  }

  await ref.set(next, { merge: true });
  return NextResponse.json({ preferences: next });
}
