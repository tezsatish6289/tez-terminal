import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  HEATMAP_ZONES_DOC,
  ZONE_KEYS,
  VALID_OVERRIDES,
  parseZones,
} from "@/lib/heatmap-zones-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const db   = getAdminFirestore();
  const snap = await db.doc(HEATMAP_ZONES_DOC).get();
  return NextResponse.json(parseZones(snap.exists ? (snap.data() ?? {}) : {}));
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db   = getAdminFirestore();

  const update: Record<string, unknown> = {};
  for (const key of ZONE_KEYS) {
    if (key in body) {
      const v = body[key];
      update[key] = typeof v === "number" && v > 0 ? v : null;
    }
  }
  if (VALID_OVERRIDES.includes(body.manualOverride)) {
    update.manualOverride = body.manualOverride;
  }
  if ("zoneConfirmMinutes" in body) {
    const v = body.zoneConfirmMinutes;
    update.zoneConfirmMinutes = typeof v === "number" && v >= 5 && v <= 60 ? v : 15;
  }
  if ("zoneHalfWidthUsd" in body) {
    const v = body.zoneHalfWidthUsd;
    update.zoneHalfWidthUsd =
      typeof v === "number" && v >= 50 && v <= 3000 ? v : null;
  }
  if ("maxPainProximityUsd" in body) {
    const v = body.maxPainProximityUsd;
    update.maxPainProximityUsd =
      typeof v === "number" && v >= 50 && v <= 2000 ? v : null;
  }
  if ("maxPainMinDistanceUsd" in body) {
    const v = body.maxPainMinDistanceUsd;
    update.maxPainMinDistanceUsd =
      typeof v === "number" && v >= 0 && v <= 3000 ? v : null;
  }

  await db.doc(HEATMAP_ZONES_DOC).set({ ...update, updatedAt: new Date().toISOString() }, { merge: true });
  return NextResponse.json({ success: true, saved: update });
}
