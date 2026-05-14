import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();

    const [stateDoc, metricsSnap] = await Promise.all([
      db.collection("config").doc("simulator_state").get(),
      db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
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
      });
    }

    const { startingCapital, capital: currentCapital, totalTradesTaken, totalWins } = state;

    // capital is maintained incrementally by the cron on every trade exit —
    // no need to re-sum all trades. This makes the endpoint O(1) forever.
    const derivedCapital = parseFloat((currentCapital ?? startingCapital ?? 0).toFixed(2));

    const totalReturnPct =
      startingCapital > 0
        ? ((derivedCapital - startingCapital) / startingCapital) * 100
        : 0;

    const avgDailyPct = runningDays > 0 ? totalReturnPct / runningDays : 0;
    const profitPerYear = avgDailyPct * 365;

    // Monthly return: use actual calendar-month PnL when ≥30 days live.
    // Requires one targeted query (closedAt this month only), still cheap.
    let profitPerMonth: number;
    let profitPerMonthIsActual = false;
    if (runningDays >= 30 && startingCapital > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthSnap = await db.collection("simulator_trades")
        .where("assetType", "==", "CRYPTO")
        .where("status", "==", "CLOSED")
        .where("closedAt", ">=", monthStart.toISOString())
        .get();
      const monthNet = monthSnap.docs.reduce((sum, doc) => {
        const t = doc.data() as any;
        const evts: any[] = t.events ?? [];
        const entryFee = evts[0]?.fee ?? 0;
        const exitPnl  = evts.slice(1).reduce((s: number, e: any) => s + (e.pnl ?? 0), 0);
        return sum + exitPnl - entryFee;
      }, 0);
      profitPerMonth = (monthNet / startingCapital) * 100;
      profitPerMonthIsActual = true;
    } else {
      profitPerMonth = avgDailyPct * 30;
    }

    const winRate =
      totalTradesTaken > 0
        ? Math.round((totalWins / totalTradesTaken) * 1000) / 10
        : null;

    return NextResponse.json({
      runningSince,
      runningDays,
      startingCapital,
      currentCapital: derivedCapital,
      totalReturnPct:       Math.round(totalReturnPct  * 100) / 100,
      profitPerDay:         Math.round(avgDailyPct      * 100) / 100,
      profitPerMonth:       Math.round(profitPerMonth   * 100) / 100,
      profitPerMonthIsActual,
      profitPerYear:        Math.round(profitPerYear    * 100) / 100,
      winRate,
      totalTrades: totalTradesTaken ?? 0,
    });
  } catch (error: any) {
    console.error("[FreedomBot Stats]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
