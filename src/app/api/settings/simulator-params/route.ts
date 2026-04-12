import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { SIM_CONFIG } from "@/lib/simulator";

export const dynamic = "force-dynamic";

const DOC_PATH = "config/simulator_params";

const ALLOWED_KEYS = new Set<string>([
  "RISK_PER_TRADE_BASE",
  "RISK_PER_TRADE_STREAK",
  "MAX_OPEN_TRADES_BASE",
  "MAX_OPEN_TRADES_CAP",
  "STREAK_WINS_TO_SCALE",
  "INCUBATED_MIN_SCORE",
  "INCUBATED_TP1_CONSUMED_MAX",
]);

export async function GET() {
  const db = getAdminFirestore();
  const doc = await db.doc(DOC_PATH).get();
  const overrides = doc.exists ? doc.data() ?? {} : {};

  const effective: Record<string, number> = {};
  for (const key of ALLOWED_KEYS) {
    effective[key] = typeof overrides[key] === "number"
      ? overrides[key]
      : SIM_CONFIG[key as keyof typeof SIM_CONFIG] as number;
  }

  return NextResponse.json({ defaults: SIM_CONFIG, overrides, effective });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getAdminFirestore();

  const sanitized: Record<string, number> = {};
  for (const [key, val] of Object.entries(body)) {
    if (ALLOWED_KEYS.has(key) && typeof val === "number" && !Number.isNaN(val)) {
      sanitized[key] = val;
    }
  }

  await db.doc(DOC_PATH).set({
    ...sanitized,
    lastUpdated: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, saved: sanitized });
}
