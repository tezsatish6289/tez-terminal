import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadMirrorsForSimTradeIds } from "@/lib/admin/load-sim-live-mirrors";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sim-open-trades/:simTradeId
 * Simulator trade + all live mirrors for that open position.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ simTradeId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { simTradeId } = await context.params;
  if (!simTradeId) {
    return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
    if (!simDoc.exists) {
      return NextResponse.json({ error: "Simulator trade not found" }, { status: 404 });
    }

    const simTrade = { id: simDoc.id, ...simDoc.data() };
    const mirrorData = await loadMirrorsForSimTradeIds(db, [simTradeId]);

    const uniqueUsers = new Set(mirrorData.mirrors.map((m) => m.userId)).size;
    const totalUnrealizedPnl = mirrorData.mirrors.reduce((s, m) => s + (m.unrealizedPnl ?? 0), 0);

    return NextResponse.json({
      simTrade,
      mirrors: mirrorData.mirrorsBySimTradeId[simTradeId] ?? [],
      analytics: {
        userCount: uniqueUsers,
        mirrorCount: mirrorData.mirrors.length,
        totalUnrealizedPnl,
        exchangeCount: mirrorData.exchangeSummary.length,
        byExchange: mirrorData.exchangeSummary.map((e) => ({
          exchange: e.exchange,
          count: e.count,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin sim-open-trades detail]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
