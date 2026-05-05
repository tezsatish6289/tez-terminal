import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  NIFTY_ZONES_DOC,
  ZONE_KEYS,
  VALID_OVERRIDES,
  parseNiftyZones,
  type ManualOverride,
} from "@/lib/nifty-zones-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminFirestore();
  const snap = await db.doc(NIFTY_ZONES_DOC).get();
  const zones = parseNiftyZones(snap.data() ?? {});
  return NextResponse.json(zones);
}

export async function PUT(request: NextRequest) {
  const db   = getAdminFirestore();
  const body = await request.json() as Record<string, unknown>;

  const existing = parseNiftyZones({});
  const snap = await db.doc(NIFTY_ZONES_DOC).get();
  if (snap.exists) Object.assign(existing, parseNiftyZones(snap.data() ?? {}));

  for (const key of ZONE_KEYS) {
    const v = body[key];
    if (typeof v === "number" && v > 0)     existing[key] = v;
    else if (v === null || v === 0)         existing[key] = null;
  }
  if (VALID_OVERRIDES.includes(body.manualOverride as ManualOverride)) {
    existing.manualOverride = body.manualOverride as ManualOverride;
  }
  const mlb = body.momentumLookbackMin;
  if (typeof mlb === "number" && mlb > 0) existing.momentumLookbackMin = mlb;
  else if (mlb === null)                  existing.momentumLookbackMin = null;

  await db.doc(NIFTY_ZONES_DOC).set(existing);
  return NextResponse.json(existing);
}
