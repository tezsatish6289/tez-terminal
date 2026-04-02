import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Delete mistaken simulator trades with flexible filters.
 *
 * Query params (all optional except key):
 *   key       — CRON_SECRET (required)
 *   symbols   — comma-separated symbol list (e.g. BANKUSDT.P,ORDERUSDT.P)
 *   asset     — asset type filter (e.g. INDIAN_STOCKS, CRYPTO)
 *   from      — ISO date, only trades opened on or after (e.g. 2026-03-31)
 *   to        — ISO date, only trades opened on or before (e.g. 2026-04-01)
 *   dry       — "true" to preview without deleting
 *
 * Examples:
 *   ?symbols=BANKUSDT.P&dry=true
 *   ?asset=INDIAN_STOCKS&from=2026-03-31&to=2026-04-01
 *   ?symbols=BANKUSDT.P,ORDERUSDT.P&asset=INDIAN_STOCKS&from=2026-03-31
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  const assetParam = request.nextUrl.searchParams.get("asset");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const dryRun = request.nextUrl.searchParams.get("dry") === "true";

  if (!symbolsParam && !assetParam && !fromParam) {
    return NextResponse.json(
      { error: "Provide at least one filter: symbols, asset, or from" },
      { status: 400 },
    );
  }

  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const fromDate = fromParam ? new Date(fromParam).toISOString() : null;
  const toDate = toParam
    ? new Date(new Date(toParam).getTime() + 86400000).toISOString()
    : null;

  const db = getAdminFirestore();
  const deleted: string[] = [];
  const previewed: string[] = [];

  // Build Firestore query with available filters
  let query: FirebaseFirestore.Query = db.collection("simulator_trades");

  if (assetParam) {
    query = query.where("assetType", "==", assetParam);
  }
  if (fromDate) {
    query = query.where("openedAt", ">=", fromDate);
  }
  if (toDate) {
    query = query.where("openedAt", "<", toDate);
  }

  const snap = await query.get();

  for (const doc of snap.docs) {
    const d = doc.data();

    // Client-side symbol filter (Firestore doesn't support IN + range together)
    if (symbols && !symbols.includes(d.symbol)) continue;

    const info = `${doc.id} | ${d.symbol} ${d.side} ${d.assetType ?? "CRYPTO"} ${d.status} opened=${d.openedAt}`;

    if (dryRun) {
      previewed.push(info);
    } else {
      await db.collection("simulator_trades").doc(doc.id).delete();
      deleted.push(info);
    }
  }

  // Clean up related simulator_logs (best-effort, symbol-based)
  const logSymbols = dryRun
    ? previewed.map((l) => l.split("|")[1]?.trim().split(" ")[0]).filter(Boolean)
    : deleted.map((l) => l.split("|")[1]?.trim().split(" ")[0]).filter(Boolean);

  const uniqueLogSymbols = [...new Set(logSymbols)];
  let logsDeleted = 0;

  if (!dryRun) {
    for (const sym of uniqueLogSymbols) {
      const logSnap = await db.collection("simulator_logs")
        .where("symbol", "==", sym)
        .get();
      for (const logDoc of logSnap.docs) {
        await db.collection("simulator_logs").doc(logDoc.id).delete();
        logsDeleted++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    filters: {
      symbols: symbols ?? "all",
      asset: assetParam ?? "all",
      from: fromParam ?? "any",
      to: toParam ?? "any",
    },
    trades: dryRun ? previewed.length : deleted.length,
    logsDeleted: dryRun ? "(skipped in dry run)" : logsDeleted,
    details: dryRun ? previewed : deleted,
  });
}
