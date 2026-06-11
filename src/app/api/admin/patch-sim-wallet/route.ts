import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeManualPositionSize } from "@/lib/manual-sim-open";
import {
  SIM_CONFIG,
  computeUnrealizedPnl,
  getSimStateDocId,
  type SimTrade,
  type SimulatorState,
} from "@/lib/simulator";

export const dynamic = "force-dynamic";

/** Max margin notional before we treat an open CRYPTO sim row as corrupted. */
const OVERSIZED_NOTIONAL_USD = 200;

/**
 * GET /api/admin/patch-sim-wallet?key=CRON_SECRET&capital=1147.84&dry=true
 *
 * Sets Crypto Bot shared ledger (`config/simulator_state`) to the given
 * capital and shrinks any open CRYPTO sim trades with absurd positionSize
 * so TP/SL closes credit sane PnL. Does not touch live_trades or zone
 * bot ledgers (`zone_sim_state_*`).
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const capitalParam = request.nextUrl.searchParams.get("capital");
  const capital = capitalParam ? parseFloat(capitalParam) : NaN;
  if (!Number.isFinite(capital) || capital < 0) {
    return NextResponse.json({ error: "capital query param required (number >= 0)" }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "true";
  const db = getAdminFirestore();
  const stateDocId = getSimStateDocId("CRYPTO");
  const stateRef = db.collection("config").doc(stateDocId);

  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) {
    return NextResponse.json({ error: "simulator_state not found" }, { status: 404 });
  }

  const beforeState = stateSnap.data() as SimulatorState;
  const sizingState: SimulatorState = {
    ...beforeState,
    capital,
    startingCapital: beforeState.startingCapital ?? 1000,
  };

  const openSnap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .where("assetType", "==", "CRYPTO")
    .get();

  const patched: object[] = [];
  const skipped: object[] = [];

  for (const doc of openSnap.docs) {
    const trade = { id: doc.id, ...doc.data() } as SimTrade;
    const oldSize = trade.positionSize ?? 0;
    if (oldSize <= OVERSIZED_NOTIONAL_USD) {
      skipped.push({ id: doc.id, symbol: trade.symbol, positionSize: oldSize, reason: "size ok" });
      continue;
    }

    const sizing = computeManualPositionSize(
      sizingState,
      SIM_CONFIG.RISK_PER_TRADE_BASE,
      trade.entryPrice,
      trade.stopLoss,
      trade.timeframe ?? "60",
      trade.leverage,
    );

    if (sizing.skip) {
      skipped.push({
        id: doc.id,
        symbol: trade.symbol,
        positionSize: oldSize,
        reason: sizing.reason ?? "size skip",
      });
      continue;
    }

    const newSize = sizing.size;
    const entryFee = parseFloat((newSize * SIM_CONFIG.EXCHANGE_FEE).toFixed(6));
    const exitPrice = trade.currentPrice ?? trade.entryPrice;
    const unrealizedPnl = parseFloat(
      computeUnrealizedPnl(
        { ...trade, positionSize: newSize, remainingPct: trade.remainingPct ?? 1 },
        exitPrice,
      ).toFixed(4),
    );

    const openEvent = trade.events?.[0];
    const patchedEvents = openEvent
      ? [
          {
            ...openEvent,
            fee: entryFee,
            timestamp: openEvent.timestamp ?? trade.openedAt,
          },
          ...(trade.events?.slice(1) ?? []),
        ]
      : trade.events;

    const update = {
      positionSize: newSize,
      capitalAtEntry: parseFloat((capital + entryFee).toFixed(4)),
      realizedPnl: parseFloat((-entryFee).toFixed(6)),
      fees: entryFee,
      unrealizedPnl,
      events: patchedEvents,
    };

    patched.push({
      id: doc.id,
      symbol: trade.symbol,
      botSource: trade.botSource,
      before: {
        positionSize: oldSize,
        capitalAtEntry: trade.capitalAtEntry,
        realizedPnl: trade.realizedPnl,
        fees: trade.fees,
      },
      after: update,
    });

    if (!dryRun) {
      await doc.ref.update(update);
    }
  }

  const stateUpdate = {
    capital: parseFloat(capital.toFixed(4)),
    lastUpdated: new Date().toISOString(),
  };

  if (!dryRun) {
    await stateRef.update(stateUpdate);
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `PATCH_SIM_WALLET: capital ${beforeState.capital?.toFixed(2)} → ${capital.toFixed(2)}; resized ${patched.length} oversized open trades`,
      webhookId: "ADMIN_PATCH_SIM_WALLET",
    });
  }

  return NextResponse.json({
    success: true,
    dryRun,
    capital: {
      before: beforeState.capital,
      after: stateUpdate.capital,
    },
    patchedCount: patched.length,
    patched,
    skippedCount: skipped.length,
    skipped,
  });
}
