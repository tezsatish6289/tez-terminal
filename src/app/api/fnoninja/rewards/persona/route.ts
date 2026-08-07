import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import {
  isFnoExperience,
  submitFnoExperience,
} from "@/lib/fnoninja/rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/fnoninja/rewards/persona
 * Body: { experience: "never" | "lt_1y" | "1_3y" | "3_5y" | "gt_5y" }
 * Saves F&O experience once and awards diamonds.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { experience?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isFnoExperience(body.experience)) {
    return NextResponse.json({ error: "Invalid experience" }, { status: 400 });
  }

  const result = await submitFnoExperience(auth.decoded.uid, body.experience);
  return NextResponse.json({ ok: true, ...result });
}
