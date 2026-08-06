import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  isClientTrialActivityType,
  recordTrialActivity,
} from "@/lib/fnoninja/trial-activity";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/activity
 * Client-emitted trial funnel events (page opens, upgrade prompts, checkout clicks).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isClientTrialActivityType(body.type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }

  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : {};

  const result = await recordTrialActivity(
    getAdminFirestore(),
    auth.decoded.uid,
    body.type,
    meta,
  );

  return NextResponse.json({ ok: true, ...result });
}
