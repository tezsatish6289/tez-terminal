import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { AggregateField } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

export async function GET() {
  try {
    const db = getAdminFirestore();

    // Fetch state, earliest metric, and the SUM of all closed trades'
    // realizedPnl in parallel.
    //
    // The aggregate sum query is one Firestore round-trip with no document
    // downloads, so we can scale to tens of thousands of trades without
    // affecting cost or latency. This is the SAME quantity the equity-curve
    // chart on /simulation and /performance computes by walking the full
    // trade list, so all three pages are guaranteed to agree.
    //
    // Why we can't trust simState.capital alone: in production the live
    // ledger drifts from Σ closed-trade realizedPnl due to historical edits,
    // imports, or non-trade adjustments — so we compute the closed equity
    // directly from the source of truth (the trade documents).
    const [stateDoc, metricsSnap, closedSumSnap] = await Promise.all([
      db.collection("config").doc("simulator_state").get(),
      db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
      db
        .collection("simulator_trades")
        .where("assetType", "==", "CRYPTO")
        .where("status", "==", "CLOSED")
        .aggregate({ totalRealized: AggregateField.sum("realizedPnl") })
        .get()
        .catch((err) => {
          console.error("[FreedomBot Stats] closed-sum aggregate failed:", err?.message ?? err);
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

    // Sum of realizedPnl across every CLOSED trade — same number the
    // /simulation and /performance equity walks produce.
    const closedRealizedSum = closedSumSnap?.data()?.totalRealized ?? null;

    // Prefer the aggregate sum; fall back to live ledger only if the
    // aggregate query itself failed (so we never block the landing page).
    const closedEquity = closedRealizedSum !== null
      ? parseFloat((startingCapital + closedRealizedSum).toFixed(2))
      : parseFloat((liveCapital ?? startingCapital ?? 0).toFixed(2));
    const derivedCapital = closedEquity;

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
      // Live ledger value (simState.capital) — exposed for debugging the
      // closed-vs-live drift; not used by the public UI.
      liveCapital: parseFloat((liveCapital ?? startingCapital ?? 0).toFixed(2)),
      closedRealizedSum: closedRealizedSum !== null
        ? parseFloat(closedRealizedSum.toFixed(2))
        : null,
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
