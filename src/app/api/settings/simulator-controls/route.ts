import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const DOC_PATH = "config/simulator_params";

export type DirectionBias = "BULL" | "BEAR" | "BOTH";

interface SimControls {
  simEnabled: boolean;
  directionBias: DirectionBias;
}

const DEFAULTS: SimControls = {
  simEnabled: true,
  directionBias: "BOTH",
};

export async function GET() {
  const db = getAdminFirestore();
  const snap = await db.doc(DOC_PATH).get();
  const data = snap.exists ? snap.data() ?? {} : {};

  return NextResponse.json({
    simEnabled: typeof data.simEnabled === "boolean" ? data.simEnabled : DEFAULTS.simEnabled,
    directionBias: ["BULL", "BEAR", "BOTH"].includes(data.directionBias) ? data.directionBias : DEFAULTS.directionBias,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getAdminFirestore();

  const update: Record<string, unknown> = {};

  if (typeof body.simEnabled === "boolean") {
    update.simEnabled = body.simEnabled;
  }
  if (["BULL", "BEAR", "BOTH"].includes(body.directionBias)) {
    update.directionBias = body.directionBias;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "No valid fields" }, { status: 400 });
  }

  await db.doc(DOC_PATH).set(update, { merge: true });

  return NextResponse.json({ success: true, saved: update });
}
