import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { buildTrialInsights } from "@/lib/fnoninja/trial-insights";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fnoninja-trial-insights
 * Trial funnel, activation drivers, hot/cold lists.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const data = await buildTrialInsights(getAdminFirestore());
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    console.error("[Admin Trial Insights]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
