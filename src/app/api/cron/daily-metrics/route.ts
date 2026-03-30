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

function buildSnapshot(retired: any[]) {
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

  return { composite, tf: byTf, algo: byAlgo };
}

const HOURLY_RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const now = new Date();

    const signalsSnap = await db.collection("signals").get();
    const retired = signalsSnap.docs
      .filter((d) => {
        const s = d.data();
        return s.status === "INACTIVE";
      })
      .map((d) => d.data());

    const snapshot = buildSnapshot(retired);

    const dailyKey = now.toISOString().slice(0, 10);
    const hourlyKey = `${dailyKey}T${String(now.getUTCHours()).padStart(2, "0")}`;

    await Promise.all([
      db.collection("daily_metrics").doc(dailyKey).set({
        date: dailyKey,
        ...snapshot,
        createdAt: now.toISOString(),
      }),
      db.collection("hourly_metrics").doc(hourlyKey).set({
        date: dailyKey,
        hour: now.getUTCHours(),
        key: hourlyKey,
        ...snapshot,
        createdAt: now.toISOString(),
      }),
    ]);

    let purged = 0;
    const cutoffDate = new Date(now.getTime() - HOURLY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const cutoffKey = `${cutoffDate.toISOString().slice(0, 10)}T${String(cutoffDate.getUTCHours()).padStart(2, "0")}`;

    const oldHourly = await db
      .collection("hourly_metrics")
      .where("key", "<", cutoffKey)
      .limit(100)
      .get();

    if (!oldHourly.empty) {
      const batch = db.batch();
      oldHourly.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      purged = oldHourly.size;
    }

    return NextResponse.json({
      success: true,
      dailyKey,
      hourlyKey,
      composite: snapshot.composite,
      timeframes: Object.keys(snapshot.tf).length,
      algos: Object.keys(snapshot.algo).length,
      hourlyPurged: purged,
    });
  } catch (error: any) {
    console.error("[Daily Metrics]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
