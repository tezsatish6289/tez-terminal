import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const CSV_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
const FIRESTORE_DOC = "config/dhan_instruments";

/**
 * GET: Show current instrument count and a few sample entries.
 */
export async function GET() {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
    return NextResponse.json({ loaded: false, count: 0 });
  }

  const data = doc.data()!;
  const { lastUpdated, ...instruments } = data;
  const symbols = Object.keys(instruments);

  return NextResponse.json({
    loaded: true,
    count: symbols.length,
    lastUpdated,
    sample: symbols.slice(0, 20).map((s) => ({ symbol: s, securityId: instruments[s] })),
  });
}

/**
 * POST: Fetch Dhan's instrument master CSV and populate Firestore.
 * Filters for NSE_EQ (equities) — the primary segment for Indian stocks.
 * Also includes BSE_EQ and NSE_FNO for future use.
 */
export async function POST() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch CSV: ${res.status}` },
        { status: 502 }
      );
    }

    const csv = await res.text();
    const lines = csv.split("\n");

    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, error: "CSV is empty or malformed" },
        { status: 502 }
      );
    }

    const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const secIdIdx = header.indexOf("SEM_SMST_SECURITY_ID");
    const symbolIdx = header.indexOf("SEM_TRADING_SYMBOL");
    const segmentIdx = header.indexOf("SEM_EXM_EXCH_ID");
    const seriesIdx = header.indexOf("SEM_SERIES");
    const instrIdx = header.indexOf("SEM_INSTRUMENT_NAME");

    if (secIdIdx === -1 || symbolIdx === -1 || segmentIdx === -1) {
      return NextResponse.json(
        { success: false, error: `Missing columns. Found: ${header.slice(0, 10).join(", ")}` },
        { status: 502 }
      );
    }

    const nseInstruments: Record<string, number> = {};
    const bseInstruments: Record<string, number> = {};
    const equitySeries = new Set(["EQ", "BE", "BZ", "SM", "ST"]);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
      if (cols.length <= Math.max(secIdIdx, symbolIdx, segmentIdx)) continue;

      const segment = cols[segmentIdx]?.toUpperCase();
      if (segment !== "NSE" && segment !== "BSE") continue;

      const series = cols[seriesIdx]?.toUpperCase() ?? "";
      const instrName = cols[instrIdx]?.toUpperCase() ?? "";
      if (instrName && instrName !== "EQUITIES" && instrName !== "EQUITY") continue;
      if (series && !equitySeries.has(series)) continue;

      const symbol = cols[symbolIdx]?.toUpperCase();
      const secId = parseInt(cols[secIdIdx], 10);

      if (symbol && !isNaN(secId) && secId > 0) {
        if (segment === "NSE") {
          nseInstruments[symbol] = secId;
        } else if (segment === "BSE" && !nseInstruments[symbol]) {
          bseInstruments[symbol] = secId;
        }
      }
    }

    // NSE takes priority — the LTP call uses NSE_EQ segment.
    // BSE IDs are included only for symbols not listed on NSE.
    const instruments: Record<string, number> = { ...bseInstruments, ...nseInstruments };

    const count = Object.keys(instruments).length;

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "No equity instruments found in CSV" },
        { status: 502 }
      );
    }

    const db = getAdminFirestore();
    await db.doc(FIRESTORE_DOC).set({
      ...instruments,
      lastUpdated: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      count,
      sample: Object.entries(instruments).slice(0, 10).map(([s, id]) => ({ symbol: s, securityId: id })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
