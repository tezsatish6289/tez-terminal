import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";
// No caching — always fresh data matching the simulator dashboard
export const revalidate = 0;

export async function GET() {
  try {
    const db = getAdminFirestore();

    // Read exactly what the simulator page reads:
    // 1. config/simulator_state (same doc the simulator dashboard shows)
    // 2. ALL simulator_trades — no limit, then filter CRYPTO client-side
    //    (matches simulator page: .filter(t => (t.assetType || "CRYPTO") === "CRYPTO"))
    const [stateDoc, tradesSnap] = await Promise.all([
      db.collection("config").doc("simulator_state").get(),
      db.collection("simulator_trades").orderBy("openedAt", "asc").get(),
    ]);

    const state = stateDoc.exists ? (stateDoc.data() as Record<string, unknown>) : null;

    // Replicate exactly what the simulator page does
    const trades = tradesSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          signalId: d.signalId ?? null,
          symbol: d.symbol ?? "—",
          side: d.side ?? "BUY",
          assetType: d.assetType ?? "CRYPTO",
          exchange: d.exchange ?? null,
          timeframe: d.timeframe ?? null,
          algo: d.algo ?? null,
          leverage: d.leverage ?? 1,
          entryPrice: d.entryPrice ?? null,
          currentPrice: d.currentPrice ?? null,
          tp1: d.tp1 ?? null,
          tp2: d.tp2 ?? null,
          tp3: d.tp3 ?? null,
          stopLoss: d.stopLoss ?? null,
          tp1Hit: d.tp1Hit ?? false,
          tp2Hit: d.tp2Hit ?? false,
          tp3Hit: d.tp3Hit ?? false,
          slHit: d.slHit ?? false,
          status: d.status ?? "OPEN",
          realizedPnl: d.realizedPnl ?? 0,
          unrealizedPnl: d.unrealizedPnl ?? 0,
          positionSize: d.positionSize ?? null,
          capitalAtEntry: d.capitalAtEntry ?? null,
          remainingPct: d.remainingPct ?? 1,
          closeReason: d.closeReason ?? null,
          openedAt: d.openedAt ?? null,
          closedAt: d.closedAt ?? null,
          // The events array is what calcPerformanceMetrics and EquityCurve use
          // Must be included — this is the source of truth for PnL calculation
          events: d.events ?? [],
        };
      })
      // Same filter as simulator page:
      .filter((t) => (t.assetType || "CRYPTO") === "CRYPTO");

    return NextResponse.json(
      { state, trades },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
