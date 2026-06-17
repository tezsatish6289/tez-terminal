import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  findOpenLiveMirrors,
  forceCloseSimTrade,
  resolveSimTradeIdsForClose,
} from "@/lib/admin/force-close-sim-trade";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseSide(raw: string | null): "BUY" | "SELL" | undefined {
  if (!raw) return undefined;
  const u = raw.toUpperCase();
  if (u === "BUY" || u === "LONG" || u === "BULL") return "BUY";
  if (u === "SELL" || u === "SHORT" || u === "BEAR") return "SELL";
  return undefined;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Ops kill switch — CRON_SECRET auth for headless incident response.
 *
 * GET  ?key=CRON_SECRET&simTradeId=…|symbol=XRPUSDT.P&side=SELL&dry=true
 *      Preview open live mirrors (and simTradeIds that would be closed).
 *
 * GET  ?key=CRON_SECRET&simTradeId=…|symbol=…&side=…
 *      Force-close sim + cascade all linked live mirrors.
 *
 * Examples:
 *   curl "$BASE/api/admin/close-live-mirrors?key=$CRON&symbol=XRP&side=SELL&dry=true"
 *   curl "$BASE/api/admin/close-live-mirrors?key=$CRON&simTradeId=sim-manual-xrp-1781661636128"
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return unauthorized();
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const simTradeId = request.nextUrl.searchParams.get("simTradeId")?.trim() || undefined;
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim() || undefined;
  const side = parseSide(request.nextUrl.searchParams.get("side"));

  if (!simTradeId && !symbol) {
    return NextResponse.json(
      { error: "Provide simTradeId and/or symbol filter" },
      { status: 400 },
    );
  }

  try {
    const db = getAdminFirestore();
    const mirrors = await findOpenLiveMirrors({ db, simTradeId, symbol, side });
    const simTradeIds = await resolveSimTradeIdsForClose({ db, simTradeId, symbol, side });

    if (dryRun) {
      const simSummaries = [];
      for (const id of simTradeIds) {
        const doc = await db.collection("simulator_trades").doc(id).get();
        if (!doc.exists) continue;
        const t = doc.data()!;
        simSummaries.push({
          id,
          symbol: t.symbol,
          side: t.side,
          status: t.status,
          openedAt: t.openedAt,
        });
      }
      return NextResponse.json({
        dryRun: true,
        filters: { simTradeId: simTradeId ?? null, symbol: symbol ?? null, side: side ?? null },
        simTradeIds,
        simTrades: simSummaries,
        openLiveMirrors: mirrors,
        mirrorCount: mirrors.length,
        userCount: new Set(mirrors.map((m) => m.userId)).size,
      });
    }

    if (simTradeIds.length === 0) {
      return NextResponse.json({
        success: true,
        noop: true,
        message: "No matching OPEN live mirrors found.",
        filters: { simTradeId: simTradeId ?? null, symbol: symbol ?? null, side: side ?? null },
      });
    }

    const results = [];
    const errors: string[] = [];
    let totalClosed = 0;
    let totalAttempted = 0;

    for (const id of simTradeIds) {
      try {
        const result = await forceCloseSimTrade(db, id);
        results.push(result);
        totalClosed += result.liveClosed;
        totalAttempted += result.liveAttempted;
        if (result.liveErrors?.length) {
          errors.push(...result.liveErrors.map((e) => `[${id}] ${e}`));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`[${id}] ${msg}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      simTradeIds,
      results,
      summary: {
        simTradesProcessed: results.length,
        liveAttempted: totalAttempted,
        liveClosed: totalClosed,
        errorCount: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin close-live-mirrors]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
