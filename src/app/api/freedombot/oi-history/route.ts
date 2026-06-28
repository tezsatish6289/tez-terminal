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
import { ensureOiHistory } from "@/lib/oi-history-ensure";
import { normalizeStockSymbol } from "@/lib/nse/fno-symbol";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Cold-start materialization may read a series of small GCS snapshot objects. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") ?? "";
  const scope = (searchParams.get("scope") ?? "index").toLowerCase();
  // When set, self-heal the series from the GCS bhavcopy cache before returning
  // (skip-if-fresh: a current series costs just one Firestore read).
  const ensure = searchParams.get("ensure") === "1";

  const symbol =
    scope === "index" ? normalizeIndexKey(rawSymbol) : normalizeStockSymbol(rawSymbol);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Unknown symbol" }, { status: 404 });
  }

  try {
    const db = getAdminFirestore();

    if (ensure) {
      const result = await ensureOiHistory(db, symbol);
      return NextResponse.json(
        {
          ok: true,
          symbol,
          scope,
          points: result.entries.length,
          history: result.entries,
          fresh: result.fresh,
          added: result.added,
          needsBackfill: result.needsBackfill,
        },
        // Short cache: repeat opens within the window skip the round-trip; the
        // series is already current so there's nothing new to fetch.
        { headers: { "Cache-Control": "public, max-age=120" } },
      );
    }

    const loaded = await loadOiHistory(db, symbol);
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
