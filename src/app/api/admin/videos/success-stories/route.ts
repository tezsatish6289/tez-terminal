import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { findSuccessStories, SUCCESS_MIN_MOVE_PCT } from "@/lib/videos/success-story";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/videos/success-stories
 * Returns ranked "success story" candidates from the SR-audit history: a
 * stock/index that reached an option-wall cluster, reacted, and ran to max pain
 * (≥5% move, max pain ≥5% from the cluster).
 *
 * Query: minMovePct, withinDays, scanLimit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const minMovePct = Number(params.get("minMovePct") ?? SUCCESS_MIN_MOVE_PCT) || SUCCESS_MIN_MOVE_PCT;
  const withinDays = Number(params.get("withinDays") ?? 45) || 45;
  const scanLimit = Math.min(500, Math.max(50, Number(params.get("scanLimit") ?? 300) || 300));

  try {
    const db = getAdminFirestore();
    const stories = await findSuccessStories(db, { minMovePct, withinDays, scanLimit });
    return NextResponse.json({ minMovePct, withinDays, count: stories.length, stories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/videos/success-stories]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
