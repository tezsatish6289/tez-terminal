import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { AggregateField } from "firebase-admin/firestore";
import {
  annualizeReturn,
  compoundReturnOverPeriod,
  MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
} from "@/lib/performance-metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

/**
 * Compute Σ realizedPnl across every closed CRYPTO trade.
 *
 * Strategy:
 *   1. Try a server-side AggregateField.sum() query — single round-trip,
 *      no document downloads.
 *   2. If aggregate is unavailable for any reason (older Firestore billing,
 *      missing aggregate index, permissions), fall back to a paginated walk
 *      of the closed-trade documents and sum on the server. Slower but
 *      always correct.
 *
 * Returns null only if Firestore itself is unreachable.
 */
async function computeClosedRealizedSum(db: FirebaseFirestore.Firestore): Promise<{
  sum: number | null;
  source: "aggregate" | "walk" | "fallback";
  closedCount: number | null;
}> {
  const baseQuery = db
    .collection("simulator_trades")
    .where("assetType", "==", "CRYPTO")
    .where("status", "==", "CLOSED");

  // Attempt 1: aggregate sum (fast path)
  try {
    const aggSnap = await baseQuery
      .aggregate({
        totalRealized: AggregateField.sum("realizedPnl"),
        closedCount:   AggregateField.count(),
      })
      .get();
    const data = aggSnap.data();
    return {
      sum: data?.totalRealized ?? 0,
      source: "aggregate",
      closedCount: data?.closedCount ?? null,
    };
  } catch (err) {
    console.warn("[FreedomBot Stats] aggregate failed, falling back to walk:", (err as Error)?.message ?? err);
  }

  // Attempt 2: full walk (slower but bulletproof)
  try {
    const snap = await baseQuery.select("realizedPnl").get();
    let sum = 0;
    snap.forEach((doc) => {
      const r = (doc.data() as { realizedPnl?: number }).realizedPnl;
      if (typeof r === "number") sum += r;
    });
    return { sum, source: "walk", closedCount: snap.size };
  } catch (err) {
    console.error("[FreedomBot Stats] closed-trade walk failed:", (err as Error)?.message ?? err);
    return { sum: null, source: "fallback", closedCount: null };
  }
}

export async function GET() {
  try {
    const db = getAdminFirestore();

    const [stateDoc, metricsSnap, closedSum, waitlistSnap] = await Promise.all([
      db.collection("config").doc("simulator_state").get(),
      db.collection("daily_metrics").orderBy("date", "asc").limit(1).get(),
      computeClosedRealizedSum(db),
      db.collection("waitlist").count().get(),
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

    const waitlistCount = waitlistSnap.data().count ?? 0;

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
        isAnnualizationReliable: false,
        winRate: null,
        totalTrades: 0,
        waitlistCount,
      }, { headers: NO_STORE_HEADERS });
    }

    const { startingCapital, capital: liveCapital, totalTradesTaken, totalWins } = state;

    // Derived current capital = startingCapital + Σ realizedPnl(closed).
    // Identical to the value walked by /simulation and /performance.
    // If both Firestore reads of the trade collection failed we fall back
    // to liveCapital so the page still shows *something*.
    const closedEquity = closedSum.sum !== null
      ? parseFloat((startingCapital + closedSum.sum).toFixed(2))
      : parseFloat((liveCapital ?? startingCapital ?? 0).toFixed(2));
    const derivedCapital = closedEquity;

    const totalReturnPct =
      startingCapital > 0
        ? ((derivedCapital - startingCapital) / startingCapital) * 100
        : 0;
    const totalReturnDecimal = totalReturnPct / 100;

    // CAGR-style compounded annualisation — same helper consumed by the
    // simulator, performance, and records pages so the headline tile, the
    // Calmar ratio, and the Sharpe / Sortino ratios can never disagree.
    const avgDailyPct = runningDays > 0 ? totalReturnPct / runningDays : 0;
    const profitPerYear = runningDays > 0
      ? annualizeReturn(totalReturnDecimal, runningDays) * 100
      : 0;
    const profitPerMonth = runningDays > 0
      ? compoundReturnOverPeriod(totalReturnDecimal, runningDays, 30) * 100
      : 0;
    const profitPerMonthIsActual = false;
    const isAnnualizationReliable = runningDays >= MIN_DAYS_FOR_RELIABLE_ANNUALIZATION;

    const winRate =
      totalTradesTaken > 0
        ? Math.round((totalWins / totalTradesTaken) * 1000) / 10
        : null;

    return NextResponse.json({
      runningSince,
      runningDays,
      startingCapital,
      currentCapital: derivedCapital,
      // Debug fields — visible in the network panel so we can spot any
      // remaining drift between the live ledger and the canonical
      // closed-trade equity.
      liveCapital: parseFloat((liveCapital ?? startingCapital ?? 0).toFixed(2)),
      closedRealizedSum: closedSum.sum !== null
        ? parseFloat(closedSum.sum.toFixed(2))
        : null,
      closedSumSource: closedSum.source,
      closedTradeCount: closedSum.closedCount,
      totalReturnPct:       Math.round(totalReturnPct  * 100) / 100,
      profitPerDay:         Math.round(avgDailyPct      * 100) / 100,
      profitPerMonth:       Math.round(profitPerMonth   * 100) / 100,
      profitPerMonthIsActual,
      profitPerYear:        Math.round(profitPerYear    * 100) / 100,
      // Annualised return uses CAGR ((1+r)^(365/d) - 1). Under
      // MIN_DAYS_FOR_RELIABLE_ANNUALIZATION days the headline tile should
      // either be hidden or shown with a "Short track record" warning.
      isAnnualizationReliable,
      winRate,
      totalTrades: totalTradesTaken ?? 0,
      waitlistCount,
    }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("[FreedomBot Stats]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
