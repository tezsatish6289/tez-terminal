import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

export async function GET() {
  try {
    const db = getAdminFirestore();

    // Fetch state, earliest metric, and currently OPEN trades in parallel.
    // Open trades are normally only a handful, so this stays effectively O(1)
    // and lets us derive the closed-trade equity used by /simulation and
    // /freedombot/performance from the live ledger without re-summing the
    // full trade history. The open-trades query is wrapped in its own
    // try/catch so that a transient failure (e.g. missing composite index)
    // never breaks the headline endpoint — we just fall back to 0 and the
    // result becomes simState.capital (live ledger).
    const [stateDoc, metricsSnap, openTradesSnap] = await Promise.all([
      db.collection("config").doc("simulator_state").get(),
      db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
      db
        .collection("simulator_trades")
        .where("assetType", "==", "CRYPTO")
        .where("status", "==", "OPEN")
        .get()
        .catch((err) => {
          console.error("[FreedomBot Stats] open-trades query failed:", err?.message ?? err);
          return null;
        }),
    ]);

    const state = stateDoc.exists ? (stateDoc.data() as any) : null;

    const earliestMetricDate = metricsSnap.empty
      ? null
      : metricsSnap.docs[0].data().date;

    let runningSince: string | null = null;
    let runningDays = 0;

    if (earliestMetricDate) {
      runningSince = earliestMetricDate;
      const startMs = new Date(earliestMetricDate).getTime();
      runningDays = Math.max(
        1,
        Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24))
      );
    }

    if (!state) {
      return NextResponse.json({
        runningSince,
        runningDays,
        startingCapital: null,
        currentCapital: null,
        totalReturnPct: null,
        profitPerDay: null,
        profitPerMonth: null,
        profitPerYear: null,
        winRate: null,
        totalTrades: 0,
      }, { headers: NO_STORE_HEADERS });
    }

    const { startingCapital, capital: liveCapital, totalTradesTaken, totalWins } = state;

    // Closed-trade equity (matches /simulation chart, /performance chart, and
    // every history-row balance):
    //   simState.capital = startingCapital + Σ ALL trades' realizedPnl
    //   closedEquity     = simState.capital − Σ OPEN trades' realizedPnl
    // Subtracting the open trades' running realizedPnl strips out their
    // entry-fee deductions and any partial-close P&L that hasn't yet rolled
    // up into a fully closed trade.
    const openRealizedPnlSum = openTradesSnap?.docs?.reduce((sum, doc) => {
      const data = doc.data() as { realizedPnl?: number };
      return sum + (data.realizedPnl ?? 0);
    }, 0) ?? 0;

    const closedEquity = parseFloat(
      ((liveCapital ?? startingCapital ?? 0) - openRealizedPnlSum).toFixed(2)
    );
    const derivedCapital = closedEquity;
    const openTradeCount = openTradesSnap?.size ?? 0;

    const totalReturnPct =
      startingCapital > 0
        ? ((derivedCapital - startingCapital) / startingCapital) * 100
        : 0;

    const avgDailyPct = runningDays > 0 ? totalReturnPct / runningDays : 0;
    const profitPerYear = avgDailyPct * 365;

    // Monthly return: project from daily average rate (avoids composite index requirement).
    // When daily_metrics accumulates enough data we can switch to exact calendar-month PnL.
    const profitPerMonth = avgDailyPct * 30;
    const profitPerMonthIsActual = false;

    const winRate =
      totalTradesTaken > 0
        ? Math.round((totalWins / totalTradesTaken) * 1000) / 10
        : null;

    return NextResponse.json({
      runningSince,
      runningDays,
      startingCapital,
      currentCapital: derivedCapital,
      // Live ledger value (incl. open-trade entry fees) — useful for clients
      // that want the raw simState figure without the open-trade stripping.
      liveCapital: parseFloat((liveCapital ?? startingCapital ?? 0).toFixed(2)),
      openTradeCount,
      totalReturnPct:       Math.round(totalReturnPct  * 100) / 100,
      profitPerDay:         Math.round(avgDailyPct      * 100) / 100,
      profitPerMonth:       Math.round(profitPerMonth   * 100) / 100,
      profitPerMonthIsActual,
      profitPerYear:        Math.round(profitPerYear    * 100) / 100,
      winRate,
      totalTrades: totalTradesTaken ?? 0,
    }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("[FreedomBot Stats]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
