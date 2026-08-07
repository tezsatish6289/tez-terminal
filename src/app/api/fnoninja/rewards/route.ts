import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { getRewardsSummary } from "@/lib/fnoninja/rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/fnoninja/rewards
 * Balance, quest status, lifetime earned, days extended, recent ledger.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await getRewardsSummary(auth.decoded.uid);
  return NextResponse.json({ ok: true, ...summary });
}
