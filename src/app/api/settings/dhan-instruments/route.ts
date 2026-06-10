import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  DHAN_INSTRUMENTS_DOC,
  fetchDhanInstrumentCsv,
  parseDhanEquityMaster,
  syncDhanFnoInstruments,
} from "@/lib/dhan-instruments-sync";

export const dynamic = "force-dynamic";

/**
 * GET: Show current instrument count and a few sample entries.
 * POST: ?mode=fno (default) sync F&O map | ?mode=all sync full NSE equity master
 */
export async function GET() {
  const db = getAdminFirestore();
  const doc = await db.doc(DHAN_INSTRUMENTS_DOC).get();

  if (!doc.exists) {
    return NextResponse.json({ loaded: false, count: 0 });
  }

  const data = doc.data()!;
  const metaKeys = new Set(["lastUpdated", "lastFnoSyncAt"]);
  const symbols = Object.keys(data).filter((k) => !metaKeys.has(k));

  return NextResponse.json({
    loaded: true,
    count: symbols.length,
    lastUpdated: data.lastUpdated,
    lastFnoSyncAt: data.lastFnoSyncAt ?? null,
    sample: symbols.slice(0, 20).map((s) => ({ symbol: s, securityId: data[s] })),
  });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "fno";
    const db = getAdminFirestore();

    if (mode === "fno") {
      const result = await syncDhanFnoInstruments(db);
      return NextResponse.json({ success: true, mode: "fno", ...result });
    }

    const csv = await fetchDhanInstrumentCsv();
    const master = parseDhanEquityMaster(csv);
    const instruments: Record<string, number> = {};
    for (const [sym, id] of master.nseEquityBySymbol) {
      instruments[sym] = id;
    }

    const count = Object.keys(instruments).length;
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "No NSE equity instruments found in CSV" },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    await db.doc(DHAN_INSTRUMENTS_DOC).set({
      ...instruments,
      lastUpdated: now,
    });

    return NextResponse.json({
      success: true,
      mode: "all",
      count,
      sample: Object.entries(instruments)
        .slice(0, 10)
        .map(([s, id]) => ({ symbol: s, securityId: id })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
