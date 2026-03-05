import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

export const dynamic = "force-dynamic";

const CUTOFF = "2026-03-02T14:00:00.000Z"; // 19:30 IST = 14:00 UTC

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") || "count";
  const key = req.nextUrl.searchParams.get("key");

  if (key !== "CLEANUP_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { firestore } = initializeFirebase();
    const snapshot = await getDocs(collection(firestore, "signals"));

    const cutoffMs = new Date(CUTOFF).getTime();
    const toDelete: { id: string; symbol: string; receivedAt: string }[] = [];

    for (const d of snapshot.docs) {
      const data = d.data();
      const receivedAt = data.receivedAt;
      if (!receivedAt) continue;
      const t = new Date(receivedAt).getTime();
      if (!isNaN(t) && t < cutoffMs) {
        toDelete.push({ id: d.id, symbol: data.symbol || "unknown", receivedAt });
      }
    }

    if (mode === "count") {
      return NextResponse.json({
        mode: "count",
        cutoff: CUTOFF,
        cutoffIST: "2026-03-02 19:30 IST",
        totalSignals: snapshot.size,
        matchingForDeletion: toDelete.length,
        signals: toDelete.map(s => `${s.symbol} — ${s.receivedAt}`),
      });
    }

    if (mode === "delete") {
      let deleted = 0;
      for (const s of toDelete) {
        await deleteDoc(doc(firestore, "signals", s.id));
        deleted++;
      }
      return NextResponse.json({
        mode: "delete",
        deleted,
        remaining: snapshot.size - deleted,
      });
    }

    return NextResponse.json({ error: "Invalid mode. Use ?mode=count or ?mode=delete" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
