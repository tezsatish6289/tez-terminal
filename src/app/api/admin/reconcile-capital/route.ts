import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  getSimStateDocId,
  checkDailyReset,
  createInitialState,
  type SimulatorState,
  type SimTrade,
} from "@/lib/simulator";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reconcile-capital?key=...&dry=true
 *
 * Recalculates simState.capital (and related counters) from the ground
 * truth in simulator_trade documents, correcting any inflation caused by
 * the double-processing bug (stale Firestore reads in sync-simulator).
 *
 * Safe to run multiple times — idempotent.
 * Use ?dry=true to preview the correction without writing anything.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = searchParams.get("dry") === "true";
  const db = getAdminFirestore();

  // Load ALL simulator trades in one query, then group by effective asset type.
  // Older trades may not have the assetType field (they default to "CRYPTO" in
  // the cron via `?? "CRYPTO"`). A filtered query would miss them, causing the
  // reconciliation to undercount and produce wrong results.
  const allTradesSnap = await db.collection("simulator_trades").get();
  const allTrades = allTradesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

  const tradesByAsset = new Map<string, SimTrade[]>();
  for (const t of allTrades) {
    const key = (t as any).assetType ?? "CRYPTO";
    if (!tradesByAsset.has(key)) tradesByAsset.set(key, []);
    tradesByAsset.get(key)!.push(t);
  }

  // Always process at least CRYPTO and INDIAN_STOCKS even if no trades
  for (const at of ["CRYPTO", "INDIAN_STOCKS"]) {
    if (!tradesByAsset.has(at)) tradesByAsset.set(at, []);
  }

  const results: Record<string, object> = {};

  for (const [assetType, trades] of tradesByAsset.entries()) {
    const stateDocId = getSimStateDocId(assetType);

    // Load current simState
    const stateDoc = await db.collection("config").doc(stateDocId).get();
    if (!stateDoc.exists) {
      results[assetType] = { skipped: "No simulator state found" };
      continue;
    }
    const currentState = checkDailyReset(stateDoc.data() as SimulatorState);
    const startingCapital = currentState.startingCapital;

    if (trades.length === 0) {
      results[assetType] = { skipped: "No trades found" };
      continue;
    }

    // Recalculate from trade documents (source of truth):
    //
    // capital = startingCapital
    //         - Σ(entryFee per trade)       → events[0].fee, always deducted on open
    //         + Σ(realizedPnl per trade)    → accumulated net PnL from exits (correct
    //                                          because overwrites, not accumulated, on
    //                                          each write; includes partial TPs on open trades)
    //
    // totalFeesPaid = Σ(trade.fees)         → entryFee + all exitFees per trade
    // totalRealizedPnl = Σ(trade.realizedPnl)
    // totalTradesTaken = number of trades

    let sumEntryFees = 0;
    let sumRealizedPnl = 0;
    let sumTotalFees = 0;
    let tradeCount = 0;

    for (const t of trades) {
      const entryFee = (t.events && t.events.length > 0) ? (t.events[0].fee ?? 0) : 0;
      sumEntryFees += entryFee;
      sumRealizedPnl += t.realizedPnl ?? 0;
      sumTotalFees += t.fees ?? 0;
      tradeCount++;
    }

    const correctCapital = parseFloat(
      (startingCapital - sumEntryFees + sumRealizedPnl).toFixed(4)
    );

    const diff = parseFloat((correctCapital - currentState.capital).toFixed(4));

    const correction = {
      capital: correctCapital,
      totalRealizedPnl: parseFloat(sumRealizedPnl.toFixed(4)),
      totalFeesPaid: parseFloat(sumTotalFees.toFixed(4)),
      totalTradesTaken: tradeCount,
      lastUpdated: new Date().toISOString(),
    };

    if (!dryRun) {
      await db.collection("config").doc(stateDocId).update(correction);

      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `RECONCILE CAPITAL [${assetType}]: was ${currentState.capital.toFixed(4)} → corrected to ${correctCapital.toFixed(4)} (diff ${diff >= 0 ? "+" : ""}${diff.toFixed(4)}) across ${tradeCount} trades`,
        webhookId: "ADMIN_RECONCILE",
      });
    }

    results[assetType] = {
      dryRun,
      tradeCount,
      startingCapital,
      before: {
        capital: currentState.capital,
        totalRealizedPnl: currentState.totalRealizedPnl,
        totalFeesPaid: currentState.totalFeesPaid,
        totalTradesTaken: currentState.totalTradesTaken,
      },
      after: correction,
      diff: {
        capital: diff,
        note: diff > 0
          ? `simState.capital was understated by ${diff.toFixed(4)}`
          : diff < 0
            ? `simState.capital was inflated by ${Math.abs(diff).toFixed(4)} — corrected`
            : "No discrepancy found",
      },
    };
  }

  return NextResponse.json({ success: true, results });
}
