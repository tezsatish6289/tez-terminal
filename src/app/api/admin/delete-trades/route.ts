import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { deleteSimTradeRecords } from "@/lib/admin/delete-sim-trade-records";

export const dynamic = "force-dynamic";

/**
 * Delete mistaken simulator trades with flexible filters.
 *
 * Query params (all optional except key):
 *   key       — CRON_SECRET (required)
 *   ids       — comma-separated simulator_trades doc ids (precise delete; skips symbol-wide log wipe)
 *   symbols   — comma-separated symbol list (e.g. BANKUSDT.P,ORDERUSDT.P)
 *   asset     — asset type filter (e.g. INDIAN_STOCKS, CRYPTO)
 *   from      — ISO date, only trades opened on or after (e.g. 2026-03-31)
 *   to        — ISO date, only trades opened on or before (e.g. 2026-04-01)
 *   dry       — "true" to preview without deleting
 *   forceLive — "true" to delete linked live_trades even if OPEN (Firestore only)
 *   action    — "closeOrphanLive" to close OPEN live mirrors whose sim is missing/CLOSED
 *   symbol    — with closeOrphanLive, e.g. XRP or XRPUSDT.P
 *   side      — with closeOrphanLive, SELL|BUY
 *
 * Examples:
 *   ?ids=sim-manual-btc-1781173062993&dry=true
 *   ?symbols=BANKUSDT.P&dry=true
 *   ?asset=INDIAN_STOCKS&from=2026-03-31&to=2026-04-01
 *   ?symbols=BANKUSDT.P,ORDERUSDT.P&asset=INDIAN_STOCKS&from=2026-03-31
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get("action");
  const dryRun = request.nextUrl.searchParams.get("dry") === "true";

  // Close orphaned OPEN live mirrors (sim missing or CLOSED). Does not touch OPEN sims.
  if (action === "closeOrphanLive") {
    const symbol = request.nextUrl.searchParams.get("symbol")?.trim() || undefined;
    const simTradeId = request.nextUrl.searchParams.get("simTradeId")?.trim() || undefined;
    const sideRaw = request.nextUrl.searchParams.get("side")?.trim().toUpperCase();
    const side =
      sideRaw === "SELL" || sideRaw === "SHORT" || sideRaw === "BEAR"
        ? ("SELL" as const)
        : sideRaw === "BUY" || sideRaw === "LONG" || sideRaw === "BULL"
          ? ("BUY" as const)
          : undefined;

    if (!symbol && !side && !simTradeId) {
      return NextResponse.json(
        { error: "Provide simTradeId and/or symbol/side filter for closeOrphanLive" },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const { findOpenLiveMirrors } = await import("@/lib/admin/force-close-sim-trade");
    const previews = await findOpenLiveMirrors({ db, symbol, side, simTradeId });

    if (dryRun) {
      const orphanPreviews = [];
      for (const row of previews) {
        const simDoc = row.simTradeId
          ? await db.collection("simulator_trades").doc(row.simTradeId).get()
          : null;
        const simOpen = simDoc?.exists && simDoc.data()?.status === "OPEN";
        orphanPreviews.push({
          ...row,
          simStatus: simDoc?.exists ? simDoc.data()?.status : "MISSING",
          orphan: !simOpen,
        });
      }
      return NextResponse.json({
        dryRun: true,
        action: "closeOrphanLive",
        filters: { simTradeId: simTradeId ?? null, symbol: symbol ?? null, side: side ?? null },
        openLiveMirrors: orphanPreviews,
        orphanCount: orphanPreviews.filter((r) => r.orphan).length,
      });
    }

    const { closeOpenLiveMirrorsByFilter } = await import(
      "@/lib/admin/cascade-close-live-mirrors"
    );
    const result = await closeOpenLiveMirrorsByFilter({
      db,
      symbol,
      side,
      simTradeId,
      orphansOnly: true,
    });

    return NextResponse.json({
      success: result.liveErrors.length === 0,
      action: "closeOrphanLive",
      filters: { simTradeId: simTradeId ?? null, symbol: symbol ?? null, side: side ?? null },
      ...result,
    });
  }

  const idsParam = request.nextUrl.searchParams.get("ids");
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  const assetParam = request.nextUrl.searchParams.get("asset");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const forceLiveDelete = request.nextUrl.searchParams.get("forceLive") === "true";

  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  if (!ids?.length && !symbolsParam && !assetParam && !fromParam) {
    return NextResponse.json(
      { error: "Provide at least one filter: ids, symbols, asset, or from" },
      { status: 400 },
    );
  }

  const db = getAdminFirestore();

  if (ids?.length) {
    const results = [];
    const errors = [];
    for (const simTradeId of ids) {
      try {
        results.push(
          await deleteSimTradeRecords({ db, simTradeId, dryRun, forceLiveDelete }),
        );
      } catch (e: unknown) {
        const err = e as Error & {
          openLiveTrades?: Array<{ id: string; exchange: string; userId: string }>;
          preview?: unknown;
        };
        errors.push({
          simTradeId,
          error: err.message,
          openLiveTrades: err.openLiveTrades ?? null,
          preview: err.preview ?? null,
        });
      }
    }

    let reconcileResult: unknown = null;
    if (!dryRun && results.length > 0) {
      const origin = new URL(request.url).origin;
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const res = await fetch(
          `${origin}/api/admin/reconcile-capital?key=${encodeURIComponent(cronSecret)}`,
          { cache: "no-store" },
        );
        reconcileResult = await res.json().catch(() => ({ error: "reconcile failed" }));
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      dryRun,
      mode: "ids",
      deleted: results.length,
      errors,
      details: results,
      reconcileResult,
    });
  }

  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const fromDate = fromParam ? new Date(fromParam).toISOString() : null;
  const toDate = toParam
    ? new Date(new Date(toParam).getTime() + 86400000).toISOString()
    : null;

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
