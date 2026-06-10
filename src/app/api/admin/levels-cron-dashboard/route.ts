import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadLevelsCronDashboard } from "@/lib/levels/levels-cron-dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/levels-cron-dashboard
 * Admin-only snapshot for the Level Cron Dashboard.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await loadLevelsCronDashboard(getAdminFirestore());
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin levels-cron-dashboard]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
