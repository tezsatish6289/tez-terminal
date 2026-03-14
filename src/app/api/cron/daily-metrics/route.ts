import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getEffectivePnl } from "@/lib/pnl";
import { getLeverage } from "@/lib/leverage";

export const dynamic = "force-dynamic";

interface MetricSnapshot {
  winRate: number;
  profitFactor: number;
  trades: number;
}

function computeMetrics(signals: any[]): MetricSnapshot {
  if (signals.length === 0) return { winRate: 0, profitFactor: 0, trades: 0 };

  const pnls = signals.map((s) => getEffectivePnl(s) * getLeverage(s.timeframe));
  const wins = pnls.filter((p) => p >= 0).length;
  const grossProfit = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));

  return {
    winRate: Math.round((wins / signals.length) * 10000) / 100,
    profitFactor: grossLoss > 0
      ? Math.round((grossProfit / grossLoss) * 100) / 100
      : grossProfit > 0 ? 999 : 0,
    trades: signals.length,
  };
}

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();

    const signalsSnap = await db.collection("signals").get();
    const retired = signalsSnap.docs
      .filter((d) => {
        const s = d.data();
        return s.status === "INACTIVE" && s.autoFilterPassed === true;
      })
      .map((d) => d.data());

    const composite = computeMetrics(retired);

    const byTf: Record<string, MetricSnapshot> = {};
    const tfGroups: Record<string, any[]> = {};
    retired.forEach((s) => {
      const tf = String(s.timeframe || "15");
      if (!tfGroups[tf]) tfGroups[tf] = [];
      tfGroups[tf].push(s);
    });
    for (const [tf, sigs] of Object.entries(tfGroups)) {
      byTf[tf] = computeMetrics(sigs);
    }

    const byAlgo: Record<string, MetricSnapshot> = {};
    const algoGroups: Record<string, any[]> = {};
    retired.forEach((s) => {
      const algo = s.algo || "V8 Reversal";
      if (!algoGroups[algo]) algoGroups[algo] = [];
      algoGroups[algo].push(s);
    });
    for (const [algo, sigs] of Object.entries(algoGroups)) {
      byAlgo[algo] = computeMetrics(sigs);
    }

    const today = new Date().toISOString().slice(0, 10);
    const docRef = db.collection("daily_metrics").doc(today);
    await docRef.set({
      date: today,
      composite,
      tf: byTf,
      algo: byAlgo,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      date: today,
      composite,
      timeframes: Object.keys(byTf).length,
      algos: Object.keys(byAlgo).length,
    });
  } catch (error: any) {
    console.error("[Daily Metrics]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
