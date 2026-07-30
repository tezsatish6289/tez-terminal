import { NextRequest, NextResponse } from "next/server";
import { releaseHeldCommissions } from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/fnoninja-affiliate-release?key=CRON_SECRET
 * Promote held commissions past holdUntil → available.
 */
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key") || "";
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseHeldCommissions();
  return NextResponse.json({ ok: true, released });
}
