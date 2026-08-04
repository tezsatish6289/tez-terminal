import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { repairSuccessStoryMfe } from "@/lib/sr-audit/repair-success-story-mfe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/sr-audit/repair-mfe
 * Recompute success-story % from chart snapshot candles and patch chat posts.
 *
 * Body/query: dryRun=1, withinDays, scanLimit
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = request.nextUrl.searchParams;
  let body: { dryRun?: boolean; withinDays?: number; scanLimit?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* optional body */
  }

  const dryRun =
    body.dryRun === true ||
    url.get("dryRun") === "1" ||
    url.get("dryRun") === "true";
  const withinDays = Number(body.withinDays ?? url.get("withinDays") ?? 365) || 365;
  const scanLimit = Math.min(
    500,
    Math.max(50, Number(body.scanLimit ?? url.get("scanLimit") ?? 500) || 500),
  );

  try {
    const result = await repairSuccessStoryMfe(getAdminFirestore(), {
      dryRun,
      withinDays,
      scanLimit,
    });
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/sr-audit/repair-mfe]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
