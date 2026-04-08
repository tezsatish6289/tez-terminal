import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const db = getAdminFirestore();

    const snap = await db
      .collection("simulator_trades")
      .orderBy("openedAt", "desc")
      .limit(500)
      .get();

    const trades = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        symbol: d.symbol,
        side: d.side,
        assetType: d.assetType ?? "CRYPTO",
        exchange: d.exchange ?? null,
        timeframe: d.timeframe ?? null,
        algo: d.algo ?? null,
        leverage: d.leverage ?? 1,
        entryPrice: d.entryPrice,
        currentPrice: d.currentPrice ?? null,
        tp1: d.tp1 ?? null,
        tp2: d.tp2 ?? null,
        tp3: d.tp3 ?? null,
        stopLoss: d.stopLoss ?? null,
        tp1Hit: d.tp1Hit ?? false,
        tp2Hit: d.tp2Hit ?? false,
        tp3Hit: d.tp3Hit ?? false,
        slHit: d.slHit ?? false,
        status: d.status,
        realizedPnl: d.realizedPnl ?? 0,
        unrealizedPnl: d.unrealizedPnl ?? 0,
        positionSize: d.positionSize ?? null,
        capitalAtEntry: d.capitalAtEntry ?? null,
        closeReason: d.closeReason ?? null,
        openedAt: d.openedAt,
        closedAt: d.closedAt ?? null,
        blockchainTxHash: d.txHash ?? null,
      };
    });

    return NextResponse.json({ trades }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
