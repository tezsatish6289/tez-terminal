import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();
    const [dailySnap, hourlySnap, signalsSnap] = await Promise.all([
      db.collection("daily_metrics").orderBy("date", "asc").get(),
      db.collection("hourly_metrics").orderBy("key", "asc").get(),
      db.collection("signals").get(),
    ]);

    const daily = dailySnap.docs.map((d) => d.data());
    const hourly = hourlySnap.docs.map((d) => d.data());

    const algoSet = new Set<string>();
    signalsSnap.docs.forEach((d) => {
      const s = d.data();
      if (s.status === "INACTIVE") {
        algoSet.add(s.algo || "V8 Reversal");
      }
    });

    return NextResponse.json({
      metrics: daily,
      hourly,
      availableAlgos: Array.from(algoSet).sort(),
    });
  } catch (error: any) {
    console.error("[Daily Metrics API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
