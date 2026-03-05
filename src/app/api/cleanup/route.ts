import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const CUTOFF = "2026-03-02T14:00:00.000Z"; // 19:30 IST = 14:00 UTC
const PROJECT_ID = "studio-6235588950-a15f2";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  }

  return initializeApp({ projectId: PROJECT_ID });
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") || "count";
  const key = req.nextUrl.searchParams.get("key");

  if (key !== "CLEANUP_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    const snapshot = await db.collection("signals").get();

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
      const batch = db.batch();
      for (const s of toDelete) {
        batch.delete(db.collection("signals").doc(s.id));
      }
      await batch.commit();
      return NextResponse.json({
        mode: "delete",
        deleted: toDelete.length,
        remaining: snapshot.size - toDelete.length,
      });
    }

    return NextResponse.json({ error: "Invalid mode. Use ?mode=count or ?mode=delete" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split("\n").slice(0, 5) }, { status: 500 });
  }
}
