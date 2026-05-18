import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadMirrorsForSimTradeIds } from "@/lib/admin/load-sim-live-mirrors";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sim-open-trades/mirrors?simTradeIds=a,b,c
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const simTradeIds = (searchParams.get("simTradeIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (simTradeIds.length === 0) {
    return NextResponse.json({
      mirrorsBySimTradeId: {},
      exchangeSummary: [],
      totalMirrors: 0,
    });
  }

  try {
    const db = getAdminFirestore();
    const data = await loadMirrorsForSimTradeIds(db, simTradeIds);
    return NextResponse.json({
      mirrorsBySimTradeId: data.mirrorsBySimTradeId,
      exchangeSummary: data.exchangeSummary,
      totalMirrors: data.totalMirrors,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin sim-open-trades mirrors]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
