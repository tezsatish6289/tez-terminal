import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();
    const [metricsSnap, signalsSnap] = await Promise.all([
      db.collection("daily_metrics").orderBy("date", "asc").get(),
      db.collection("signals").get(),
    ]);

    const data = metricsSnap.docs.map((d) => d.data());

    const algoSet = new Set<string>();
    signalsSnap.docs.forEach((d) => {
      const s = d.data();
      if (s.status === "INACTIVE" && s.autoFilterPassed === true) {
        algoSet.add(s.algo || "V8 Reversal");
      }
    });

    return NextResponse.json({
      metrics: data,
      availableAlgos: Array.from(algoSet).sort(),
    });
  } catch (error: any) {
    console.error("[Daily Metrics API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
