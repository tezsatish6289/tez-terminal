import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * DELETE mistaken simulator trades by symbol list.
 * Usage: /api/admin/delete-trades?key=CRON_SECRET&symbols=BANKUSDT.P,ORDERUSDT.P,SPORTFUNUSDT.P
 * Add &dry=true to preview without deleting.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "Missing ?symbols=SYM1,SYM2" }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const db = getAdminFirestore();

  const results: { collection: string; deleted: string[]; logs: string[] } = {
    collection: "simulator_trades",
    deleted: [],
    logs: [],
  };

  for (const symbol of symbols) {
    const snap = await db.collection("simulator_trades")
      .where("symbol", "==", symbol)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      const info = `${doc.id} | ${d.symbol} ${d.side} ${d.status} opened=${d.openedAt}`;
      if (dryRun) {
        results.logs.push(`[DRY] Would delete: ${info}`);
      } else {
        await db.collection("simulator_trades").doc(doc.id).delete();
        results.deleted.push(info);
      }
    }

    // Also clean up related simulator_logs
    const logSnap = await db.collection("simulator_logs")
      .where("symbol", "==", symbol)
      .get();
    for (const logDoc of logSnap.docs) {
      if (dryRun) {
        results.logs.push(`[DRY] Would delete log: ${logDoc.id}`);
      } else {
        await db.collection("simulator_logs").doc(logDoc.id).delete();
      }
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    symbols,
    deletedTrades: results.deleted.length,
    details: dryRun ? results.logs : results.deleted,
  });
}
