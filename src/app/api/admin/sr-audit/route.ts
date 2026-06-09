import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { buildSrAuditSummary, enrichSrEventsWithLiveSpot, querySrZoneEvents } from "@/lib/sr-audit/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/sr-audit
 * Query: state, side, symbol, from, to, limit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, Number(params.get("limit") ?? 200) || 200));

  try {
    const db = getAdminFirestore();
    const events = await querySrZoneEvents(db, {
      limit,
      state: params.get("state"),
      side: params.get("side"),
      symbol: params.get("symbol"),
      from: params.get("from"),
      to: params.get("to"),
    });
    const enriched = await enrichSrEventsWithLiveSpot(db, events);
    const summary = await buildSrAuditSummary(db, enriched);
    const rows = enriched.map((e) => {
      const row = e as typeof e & { id?: string };
      return { id: row.id, ...e };
    });

    return NextResponse.json({ summary, events: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/sr-audit]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
