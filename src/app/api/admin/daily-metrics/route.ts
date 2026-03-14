import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();
    const snap = await db
      .collection("daily_metrics")
      .orderBy("date", "asc")
      .get();

    const data = snap.docs.map((d) => d.data());
    return NextResponse.json({ metrics: data });
  } catch (error: any) {
    console.error("[Daily Metrics API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
