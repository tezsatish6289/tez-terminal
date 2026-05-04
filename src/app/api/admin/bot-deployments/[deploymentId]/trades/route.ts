import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * GET /api/admin/bot-deployments/:deploymentId/trades?cursor=&pageSize=50
 * Newest trades first. cursor = live_trades document id from previous page.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> }
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
      Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10) || PAGE_SIZE)
    );

    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const dep = deployDoc.data()!;
    const uid = String(dep.uid ?? "");
    const exchange = String(dep.exchange ?? "");
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    let q = db
      .collection("live_trades")
      .where("userId", "==", uid)
      .where("exchange", "==", exchange)
      .where("testnet", "==", false)
      .orderBy("openedAt", "desc")
      .limit(pageSize + 1);

    if (cursor) {
      const cur = await db.collection("live_trades").doc(cursor).get();
      if (cur.exists) {
        q = q.startAfter(cur);
      }
    }

    const snap = await q.get();
    const hasMore = snap.size > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const trades = docs.map((d) => {
      const t = d.data();
      const realized =
        typeof t.exchangeRealizedPnl === "number"
          ? t.exchangeRealizedPnl
          : typeof t.realizedPnl === "number"
            ? t.realizedPnl
            : 0;
      return {
        id: d.id,
        symbol: (t.signalSymbol ?? t.symbol ?? "—") as string,
        side:
          t.side === "BUY" ? "LONG" : t.side === "SELL" ? "SHORT" : String(t.side ?? "—"),
        status: t.status === "OPEN" ? "open" : "closed",
        realizedPnl: realized,
        positionSize: t.positionSize ?? null,
        leverage: t.leverage ?? 1,
        entryPrice: t.entryPrice ?? null,
        exitPrice: (t.exchangeAvgExitPrice ?? t.currentPrice ?? null) as number | null,
        openedAt: (t.openedAt as string) ?? null,
        closedAt: (t.closedAt as string) ?? null,
      };
    });

    const last = docs[docs.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return NextResponse.json({
      trades,
      nextCursor,
      hasMore,
      pageSize,
      deploymentId,
      userId: uid,
      exchange,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Trades]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
