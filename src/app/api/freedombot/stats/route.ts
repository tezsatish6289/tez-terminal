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
        totalReturnPct: null,
        profitPerDay: null,
        profitPerMonth: null,
        profitPerYear: null,
        winRate: null,
        totalTrades: 0,
      });
    }

    const {
      capital,
      startingCapital,
      totalTradesTaken,
      totalWins,
    } = state;

    // Use actual capital growth (includes open + closed positions) not just realized PnL
    const totalReturnPct =
      startingCapital > 0 ? ((capital - startingCapital) / startingCapital) * 100 : 0;

    const avgDailyPct = runningDays > 0 ? totalReturnPct / runningDays : 0;
    const profitPerMonth = avgDailyPct * 30;
    const profitPerYear = avgDailyPct * 365;

    const winRate =
      totalTradesTaken > 0
        ? Math.round((totalWins / totalTradesTaken) * 1000) / 10
        : null;

    return NextResponse.json({
      runningSince,
      runningDays,
      currentCapital: capital,
      startingCapital,
      totalReturnPct: Math.round(totalReturnPct * 100) / 100,
      profitPerDay: Math.round(avgDailyPct * 100) / 100,
      profitPerMonth: Math.round(profitPerMonth * 100) / 100,
      profitPerYear: Math.round(profitPerYear * 100) / 100,
      winRate,
      totalTrades: totalTradesTaken ?? 0,
    });
  } catch (error: any) {
    console.error("[FreedomBot Stats]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
