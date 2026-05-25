import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { bestRealizedPnl } from "@/lib/freedombot/compute-best-pnl";
import { getDeploymentAggregates, tradeMatchesDeployBot } from "@/lib/freedombot/aggregates";

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
    const deployBot = String(dep.bot ?? "CRYPTO");
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

    // Cached aggregates carry the open + closed trade counts and the lifetime
    // realised PnL. They live on the deployment doc — O(1) read — and are
    // bootstrapped (rebuilt + persisted) on first read if missing. We use
    // these for the UI's "X / Y loaded" line and the PnL stat card so it no
    // longer depends on how many pages the user has scrolled.
    const aggregatesPromise = cursor
      ? Promise.resolve(null)
      : getDeploymentAggregates(db, {
          uid,
          exchange,
          bot: deployBot,
          openTradeCount: dep.openTradeCount as number | undefined,
          closedTradeCount: dep.closedTradeCount as number | undefined,
          lifetimeRealizedPnl: dep.lifetimeRealizedPnl as number | undefined,
          aggregatesBot: dep.aggregatesBot as string | undefined,
        }).catch((err) => {
          console.warn(
            `[admin trades] aggregate resolve failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });

    const [snap, aggregates] = await Promise.all([q.get(), aggregatesPromise]);
    const hasMore = snap.size > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const filteredDocs = docs.filter((d) =>
      tradeMatchesDeployBot(d.data(), deployBot),
    );
    const totalCount = aggregates
      ? aggregates.openTradeCount + aggregates.closedTradeCount
      : null;

    // Mirror /api/freedombot/my-trades exactly so the admin trade table can
    // share rendering logic with the user dashboard. The shared
    // `bestRealizedPnl` resolver picks the most-trustworthy PnL value (and a
    // source label) so per-row, cumulative, and lifetime figures all agree.
    const trades = filteredDocs.map((d) => {
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
        stopLoss: typeof t.stopLoss === "number" ? t.stopLoss : null,
        trailingSl: typeof t.trailingSl === "number" ? t.trailingSl : null,
        capitalAtEntry: t.capitalAtEntry ?? null,
        blockchainTxHash: t.blockchainTxHash ?? null,
        openedAt: (t.openedAt as string) ?? null,
        closedAt: (t.closedAt as string) ?? null,
        botSource: typeof t.botSource === "string" ? t.botSource : null,
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
      ...(aggregates
        ? {
            aggregates: {
              lifetimeRealizedPnl: aggregates.lifetimeRealizedPnl,
              openTradeCount: aggregates.openTradeCount,
              closedTradeCount: aggregates.closedTradeCount,
              source: aggregates.source,
            },
          }
        : {}),
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
