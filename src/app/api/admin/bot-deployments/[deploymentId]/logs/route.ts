import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * GET /api/admin/bot-deployments/:deploymentId/logs?cursor=&pageSize=50
 * Newest `live_trade_logs` first for this deployment's uid + exchange (production signals).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { deploymentId } = await context.params;
  if (!deploymentId) {
    return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor")?.trim() || null;
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10) || PAGE_SIZE),
    );

    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const dep = deployDoc.data()!;
    const uid = String(dep.uid ?? "");
    const exchange = String(dep.exchange ?? "").toUpperCase();
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    let q = db
      .collection("live_trade_logs")
      .where("exchange", "==", exchange)
      .where("userId", "==", uid)
      .orderBy("timestamp", "desc")
      .limit(pageSize + 1);

    if (cursor) {
      const cur = await db.collection("live_trade_logs").doc(cursor).get();
      if (cur.exists) {
        q = q.startAfter(cur);
      }
    }

    const snap = await q.get();
    const hasMore = snap.size > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const logs = docs.map((d) => {
      const L = d.data();
      return {
        id: d.id,
        timestamp: (L.timestamp as string) ?? "",
        action: String(L.action ?? "—"),
        details: String(L.details ?? ""),
        symbol: (L.symbol as string) ?? undefined,
        signalId: (L.signalId as string) ?? undefined,
        exchange: (L.exchange as string) ?? exchange,
        assetType: (L.assetType as string) ?? undefined,
      };
    });

    const last = docs[docs.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return NextResponse.json({
      logs,
      nextCursor,
      hasMore,
      pageSize,
      deploymentId,
      userId: uid,
      exchange,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Logs]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
