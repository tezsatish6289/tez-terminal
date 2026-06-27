/**
 * /api/freedombot/oi-history?symbol=NIFTY&scope=index
 *
 * One-doc read of the daily OI-wall history (put wall / call wall / max pain over
 * time) that powers the levels chart "History mode". Cheap: a single Firestore
 * doc read per symbol.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { loadOiHistory } from "@/lib/oi-history";
import { normalizeStockSymbol } from "@/lib/nse/fno-symbol";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") ?? "";
  const scope = (searchParams.get("scope") ?? "index").toLowerCase();

  const symbol =
    scope === "index" ? normalizeIndexKey(rawSymbol) : normalizeStockSymbol(rawSymbol);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Unknown symbol" }, { status: 404 });
  }

  try {
    const loaded = await loadOiHistory(getAdminFirestore(), symbol);
    return NextResponse.json(
      {
        ok: true,
        symbol,
        scope,
        points: loaded.entries.length,
        history: loaded.entries,
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), history: [] },
      { status: 200 },
    );
  }
}
