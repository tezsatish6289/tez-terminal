import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { bestRealizedPnl } from "@/lib/freedombot/compute-best-pnl";

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

    const baseQuery = db
      .collection("live_trades")
      .where("userId", "==", uid)
      .where("exchange", "==", exchange)
      .where("testnet", "==", false);

    let q = baseQuery.orderBy("openedAt", "desc").limit(pageSize + 1);

    if (cursor) {
      const cur = await db.collection("live_trades").doc(cursor).get();
      if (cur.exists) {
        q = q.startAfter(cur);
      }
    }

    // Count the full result set so the UI can show "50 of 77 loaded" instead
    // of just the paged length (which used to be mistaken for the total).
    // Only run on the first page to avoid burning a count query per scroll.
    const totalCountPromise = cursor
      ? Promise.resolve<number | null>(null)
      : baseQuery
          .count()
          .get()
          .then((snap) => snap.data().count)
          .catch(() => null);

    const [snap, totalCount] = await Promise.all([q.get(), totalCountPromise]);
    const hasMore = snap.size > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    // Mirror /api/freedombot/my-trades exactly so the admin trade table can
    // share rendering logic with the user dashboard. The shared
    // `bestRealizedPnl` resolver picks the most-trustworthy PnL value (and a
    // source label) so per-row, cumulative, and lifetime figures all agree.
    const trades = docs.map((d) => {
      const t = d.data();
      const isOpen = t.status === "OPEN";
      const internal = Number(t.realizedPnl ?? 0);
      const ex =
        typeof t.exchangeRealizedPnl === "number" && !Number.isNaN(t.exchangeRealizedPnl)
          ? Number(t.exchangeRealizedPnl)
          : null;
      const ov =
        typeof t.exchangeRealizedPnlOverride === "number" &&
        !Number.isNaN(t.exchangeRealizedPnlOverride)
          ? Number(t.exchangeRealizedPnlOverride)
          : null;
      const best = !isOpen ? bestRealizedPnl(t) : null;
      const unrealized =
        typeof t.unrealizedPnl === "number" && isOpen ? Number(t.unrealizedPnl) : 0;
      return {
        id: d.id,
        exchange: t.exchange ?? null,
        symbol: (t.signalSymbol ?? t.symbol ?? "—") as string,
        side:
          t.side === "BUY" ? "LONG" : t.side === "SELL" ? "SHORT" : String(t.side ?? "—"),
        status: isOpen ? "open" : "closed",
        realizedPnl: best?.value ?? internal,
        realizedPnlSource: best?.source ?? null,
        realizedPnlInternal: internal,
        realizedPnlExchange: ex,
        exchangeRealizedPnlOverride: ov,
        exchangePnlReconciledAt: t.exchangePnlReconciledAt ?? null,
        unrealizedPnl: unrealized,
        positionSize: t.positionSize ?? null,
        leverage: t.leverage ?? 1,
        entryPrice: t.entryPrice ?? null,
        currentPrice: t.exchangeAvgExitPrice ?? t.currentPrice ?? null,
        capitalAtEntry: t.capitalAtEntry ?? null,
        blockchainTxHash: t.blockchainTxHash ?? null,
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
      totalCount,
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
