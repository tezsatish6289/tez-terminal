import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import {
  checkOrderFills,
  handleTpFill,
  handleSlFill,
  moveSlToBreakeven,
  protectiveClose,
  cancelResidualExitOrders,
  type LiveTrade,
  type Credentials,
} from "@/lib/trade-engine";
import { type SimTrade } from "@/lib/simulator";
import { computeAutoFilter, mapFirestoreSignal } from "@/lib/auto-filter";
import { decrypt } from "@/lib/crypto";
import { sendMessage } from "@/lib/telegram";
import {
  type ExchangeName,
  deserializePrices,
  getPrice,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  replaceSl,
  type AllExchangePrices,
} from "@/lib/exchanges";
import {
  reconcileTradeExchangePnl,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import {
  applyTradeChangeToAggregates,
  type TradeAggregateSnapshot,
} from "@/lib/freedombot/aggregates";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";
import { recordCronHeartbeat } from "@/lib/cron-health";
import { resolveDailyLossLimit } from "@/lib/freedombot/trading-prefs-shared";
import { dailyLossHaltPatchForToday } from "@/lib/freedombot/daily-loss-gate";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Best-effort: as soon as a trade transitions to CLOSED, fetch the venue's
 * realized PnL and persist it on the doc. Wrapped in try/catch so a stale row
 * (Bybit hasn't indexed yet) never blocks the cron. The closed-PnL backfill
 * loop runs every cycle as a fallback safety net.
 */
async function reconcileClosedTradePnlBestEffort(
  db: FirebaseFirestore.Firestore,
  tradeId: string,
  trade: Partial<LiveTrade> & { symbol: string; openedAt: string },
  exchange: ExchangeName,
  creds: Credentials,
): Promise<void> {
  if (!exchangeSupportsClosedPnlReconciliation(exchange)) return;
  try {
    const closedAt = trade.closedAt ?? new Date().toISOString();
    await reconcileTradeExchangePnl(
      db,
      tradeId,
      {
        symbol: trade.symbol,
        openedAt: trade.openedAt,
        closedAt,
        side: trade.side as "BUY" | "SELL" | undefined,
        entryOrderId: trade.entryOrderId,
        slOrderId: trade.slOrderId ?? null,
        tp1OrderId: trade.tp1OrderId ?? null,
        tp2OrderId: trade.tp2OrderId ?? null,
        tp3OrderId: trade.tp3OrderId ?? null,
        closeOrderId: trade.closeOrderId ?? null,
      },
      creds,
      exchange,
      // Tight retry budget so we don't slow down the cron tick. The cron's own
      // backfill loop will keep trying on subsequent ticks if we miss.
      { maxAttempts: 3, delayMs: 600 },
    );
  } catch {
    // Never let PnL reconciliation failures derail trade lifecycle.
  }
}

/**
 * Per-user trade management. Isolated so one user's failure
 * doesn't block others.
 */
async function syncUserTrades(
  userId: string,
  exchange: ExchangeName,
  creds: Credentials,
  userSettings: { dailyLossLimit: number },
  allPrices: AllExchangePrices,
  liveScores: Map<string, { score: number; pattern: string | null }>,
  db: FirebaseFirestore.Firestore
): Promise<{
  fills: number;
  updates: number;
  protectiveCloses: number;
  simSlSynced: number;
  simCloseSynced: number;
  errors: string[];
}> {
  const result = { fills: 0, updates: 0, protectiveCloses: 0, simSlSynced: 0, simCloseSynced: 0, errors: [] as string[] };

  try {
    // ── 0a. Residual order cleanup for trades flagged on previous close ──
    // When a close-path could not verify all SL/TP orders were cancelled, the
    // trade is flagged with `residualOrdersPendingCleanup: true`. Retry here
    // so leftover triggers can't fire against a future position on the same
    // symbol. Capped at 20/cycle and best-effort — never blocks the rest of sync.
    try {
      const residualSnap = await db.collection("live_trades")
        .where("userId", "==", userId)
        .where("exchange", "==", exchange)
        .where("residualOrdersPendingCleanup", "==", true)
        .limit(20)
        .get();

      const connector = getConnector(exchange);
      for (const doc of residualSnap.docs) {
        const lt = { id: doc.id, ...doc.data() } as LiveTrade;
        try {
          const cleanup = await cancelResidualExitOrders(connector, lt.symbol, creds);
          if (cleanup.success) {
            await doc.ref.update({ residualOrdersPendingCleanup: false });
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "RESIDUAL_CLEANUP_OK",
              details: `${lt.signalSymbol}: leftover exit orders cleared on retry (cancelled=${cleanup.cancelledCount}, attempts=${cleanup.attempts})`,
              symbol: lt.signalSymbol,
              userId,
              exchange,
              assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
            });
          } else {
            // Stay flagged for next cycle — don't spam logs every minute.
            result.errors.push(
              `${lt.signalSymbol}: residual cleanup retry still pending (remaining=${cleanup.remainingCount})`
            );
          }
        } catch (err) {
          result.errors.push(
            `${lt.signalSymbol}: residual cleanup retry threw — ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch {
      // best effort — never block main sync
    }

    // Closed-trade exchange-PnL backfill moved to /api/cron/sync-exchange-pnl
    // (runs every 5 min as its own cron). Inline opportunistic reconciliation
    // right after a fresh fill is still handled below via
    // `reconcileClosedTradePnlBestEffort` — that's the fast path; the
    // dedicated cron is the safety net.

    const liveTradesSnap = await db.collection("live_trades")
      .where("status", "==", "OPEN")
      .where("userId", "==", userId)
      .where("exchange", "==", exchange)
      .get();

    if (liveTradesSnap.empty) return result;

    const liveTrades = liveTradesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LiveTrade));

    // ── 1. Check order fills for each trade ─────────────────
    for (const lt of liveTrades) {
      try {
        // Order fill check is best-effort: if the exchange API fails, we still
        // update the price below. Wrapping in its own try-catch prevents a single
        // API error from blocking price updates for all open trades.
        try {
          const fills = await checkOrderFills(lt, creds);

          for (const fill of fills.fills) {
            if (fill.type === "SL") {
              const slResult = await handleSlFill(lt, fill.price, fill.qty, creds);
              const { id: _slId, ...slFields } = { id: lt.id, ...slResult.updatedFields };
              const slEvents = [...(lt.events || []), slResult.newEvent];
              const aggBefore: TradeAggregateSnapshot = { ...lt };
              await db.collection("live_trades").doc(lt.id!).update({
                ...slFields,
                events: slEvents,
              });
              await applyTradeChangeToAggregates(db, aggBefore, {
                ...aggBefore,
                ...slResult.updatedFields,
                events: slEvents,
              });
              if (slResult.warnings.length) {
                await db.collection("live_trade_logs").add({
                  timestamp: new Date().toISOString(),
                  action: "WARNING",
                  details: `${lt.signalSymbol} SL warnings: ${slResult.warnings.join("; ")}`,
                  symbol: lt.signalSymbol,
                  userId,
                  exchange,
                  assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
                });
              }
              await db.collection("live_trade_logs").add({
                timestamp: new Date().toISOString(),
                action: "SL_HIT",
                details: `${lt.signalSymbol} ${lt.side} SL hit @ $${fill.price} PnL: $${slResult.newEvent.pnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange,
                assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
              });
              lt.status = "CLOSED";
              Object.assign(lt, slResult.updatedFields);
              result.fills++;
              // Pull realized PnL from the venue right now while we have creds in hand.
              await reconcileClosedTradePnlBestEffort(db, lt.id!, lt, exchange, creds);
            } else {
              const tpLevel = fill.type === "TP1" ? 1 : fill.type === "TP2" ? 2 : 3;
              const tpResult = await handleTpFill(lt, tpLevel as 1 | 2 | 3, fill.price, fill.qty, creds);
              const updatedEvents = [...(lt.events || []), tpResult.newEvent];
              const tpAggBefore: TradeAggregateSnapshot = { ...lt };
              await db.collection("live_trades").doc(lt.id!).update({
                ...tpResult.updatedFields,
                events: updatedEvents,
              });
              await applyTradeChangeToAggregates(db, tpAggBefore, {
                ...tpAggBefore,
                ...tpResult.updatedFields,
                events: updatedEvents,
              });
              if (tpResult.warnings.length) {
                await db.collection("live_trade_logs").add({
                  timestamp: new Date().toISOString(),
                  action: "WARNING",
                  details: `${lt.signalSymbol} TP${tpLevel} warnings: ${tpResult.warnings.join("; ")}`,
                  symbol: lt.signalSymbol,
                  userId,
                  exchange,
                  assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
                });
              }
              await db.collection("live_trade_logs").add({
                timestamp: new Date().toISOString(),
                action: `TP${tpLevel}_HIT`,
                details: `${lt.signalSymbol} ${lt.side} TP${tpLevel} hit @ $${fill.price} PnL: $${tpResult.newEvent.pnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange,
                assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
              });
              Object.assign(lt, tpResult.updatedFields);
              lt.events = updatedEvents;
              result.fills++;
              // If this TP brought us flat, immediately reconcile exchange PnL.
              if (tpResult.updatedFields.status === "CLOSED") {
                await reconcileClosedTradePnlBestEffort(db, lt.id!, lt, exchange, creds);
              }
            }
          }
        } catch (fillErr: any) {
          // Log the fill check failure but continue with price update
          result.errors.push(`${lt.signalSymbol} fill-check: ${fillErr.message}`);
          console.warn(`[LiveSync] Fill check failed for ${lt.signalSymbol}: ${fillErr.message}`);
        }

        if (lt.status === "CLOSED") continue;

        // ── 2. Update current price + unrealized PnL ─────────
        const livePrice = getPrice(allPrices, lt.signalSymbol, exchange);
        if (livePrice != null) {
          const isBuy = lt.side === "BUY";
          const priceDiff = isBuy ? livePrice - lt.entryPrice : lt.entryPrice - livePrice;
          // Futures unrealised PnL = priceMove% * notional. `lt.positionSize`
          // is already the notional value at entry (entryPrice * fillQty), so
          // there is no leverage multiplier here.
          const unrealizedPnl = (priceDiff / lt.entryPrice) * lt.positionSize;

          const liveScored = lt.signalId ? (liveScores.get(lt.signalId) ?? null) : null;
          await db.collection("live_trades").doc(lt.id!).update({
            currentPrice: livePrice,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            ...(liveScored != null ? {
              currentScore: liveScored.score,
              currentScorePattern: liveScored.pattern,
            } : {}),
          });
          lt.currentPrice = livePrice;
          lt.unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
        }

        // ── 3. Trailing SL → breakeven (safety net for non-sim-driven trades) ──
        if (livePrice != null && lt.trailingSl == null && !lt.simTradeId) {
          const slBeResult = await moveSlToBreakeven(lt, livePrice, creds);
          if (slBeResult.moved && slBeResult.updatedFields && slBeResult.newEvent) {
            await db.collection("live_trades").doc(lt.id!).update({
              ...slBeResult.updatedFields,
              events: [...(lt.events || []), slBeResult.newEvent],
            });
            Object.assign(lt, slBeResult.updatedFields);
            result.updates++;
          }
          if (slBeResult.moved) {
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "SL_TO_BREAKEVEN",
              details: `${lt.signalSymbol} ${lt.side} SL moved to breakeven @ $${lt.entryPrice}`,
              symbol: lt.signalSymbol,
              userId,
              exchange,
              assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
            });
          }
          if (slBeResult.warning) {
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "WARNING",
              details: `${lt.signalSymbol} SL→BE: ${slBeResult.warning}`,
              symbol: lt.signalSymbol,
              userId,
              exchange,
              assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
            });
          }
        }

        // ── 4. Sim-driven trailing SL sync ──────────────────────
        // The simulator is the source of truth for trailing SL levels.
        // Every cycle we compare the live SL against the sim's and update
        // the exchange order if they have drifted. Idempotent by design:
        // if the API call fails we log and retry on the next cycle.
        if (lt.simTradeId) {
          try {
            const simDoc = await db.collection("simulator_trades").doc(lt.simTradeId).get();
            if (simDoc.exists) {
              const sim = simDoc.data() as SimTrade;
              const simTsl = sim.trailingSl ?? null;

              if (simTsl != null && simTsl !== lt.trailingSl) {
                const connector = getConnector(exchange);
                const info = await connector.getSymbolInfo(lt.symbol, creds.testnet);

                if (lt.slOrderId) {
                  // Replace the existing SL order at the new price
                  const oldSlOrderId = lt.slOrderId;
                  const slResult = await replaceSl(
                    connector, lt.symbol, lt.side, lt.slOrderId,
                    simTsl, lt.remainingQty, info, creds
                  );
                  if (slResult.newOrder.success) {
                    const newSlOrderId = slResult.newOrder.order!.orderId;
                    // Append the previous SL order id to the doc's history so PnL
                    // reconciliation can match a venue row referencing it (Bybit
                    // returns the orderId that actually filled).
                    await db.collection("live_trades").doc(lt.id!).update({
                      trailingSl: simTsl,
                      slOrderId: newSlOrderId,
                      historicalSlOrderIds: FieldValue.arrayUnion(oldSlOrderId),
                    });
                    Object.assign(lt, { trailingSl: simTsl, slOrderId: newSlOrderId });
                    await db.collection("live_trade_logs").add({
                      timestamp: new Date().toISOString(),
                      action: "TRAILING_SL_SYNCED",
                      details: `${lt.signalSymbol} ${lt.side} SL updated ${lt.trailingSl ?? lt.stopLoss} → ${simTsl} (sim-driven)`,
                      symbol: lt.signalSymbol,
                      userId,
                      exchange,
                      assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
                    });
                    result.simSlSynced++;
                  } else {
                    // Cancel may have fired but new SL failed — null out slOrderId so
                    // the next cycle places a fresh stop rather than trying to cancel a
                    // ghost order.
                    await db.collection("live_trades").doc(lt.id!).update({ slOrderId: null });
                    lt.slOrderId = null;
                    result.errors.push(
                      `${lt.signalSymbol}: trailing SL move to ${simTsl} failed — ${slResult.newOrder.error} (will retry)`
                    );
                  }
                } else {
                  // No SL order on file (previous replace half-failed) — place a fresh stop
                  const exitSide = lt.side === "BUY" ? "SELL" : "BUY";
                  try {
                    const newOrder = await connector.placeStopMarket(
                      lt.symbol, exitSide, simTsl, lt.remainingQty, creds, info.tickSize
                    );
                    await db.collection("live_trades").doc(lt.id!).update({
                      trailingSl: simTsl,
                      slOrderId: newOrder.orderId,
                    });
                    Object.assign(lt, { trailingSl: simTsl, slOrderId: newOrder.orderId });
                    result.simSlSynced++;
                  } catch (freshSlErr) {
                    result.errors.push(
                      `${lt.signalSymbol}: fresh SL at ${simTsl} failed — ${freshSlErr instanceof Error ? freshSlErr.message : String(freshSlErr)} (will retry)`
                    );
                  }
                }
              }
            }
          } catch (slSyncErr) {
            const errMsg = slSyncErr instanceof Error ? slSyncErr.message : String(slSyncErr);
            result.errors.push(`${lt.signalSymbol} SL-sync: ${errMsg}`);
          }
        }
      } catch (ltErr) {
        const errMsg = ltErr instanceof Error ? ltErr.message : String(ltErr);
        console.error(`[LiveSync] Trade update failed for ${lt.signalSymbol} (${userId}/${exchange}):`, errMsg);
        result.errors.push(`${lt.signalSymbol}: ${errMsg}`);
      }
    }

    // ── 3. Sim-driven close sync ─────────────────────────────
    // If the simulator has closed a trade for risk reasons the venue may not
    // have reflected yet (trailing SL, original SL catch-up, zone exits, etc.),
    // close the matching live trade immediately.
    //
    // Retry guarantee: if protectiveClose fails the Firestore doc is NOT updated,
    // so live_trade.status stays OPEN and we retry on the next cron cycle
    // (the sim doc still shows CLOSED).
    const openForSimSync = liveTrades.filter((t) => t.status === "OPEN" && !!t.simTradeId);
    for (const lt of openForSimSync) {
      try {
        const simDoc = await db.collection("simulator_trades").doc(lt.simTradeId!).get();

        // If the sim trade no longer exists, the live trade is orphaned — close it.
        // This guards against sim trade deletion or a write failure at entry time.
        const simGone = !simDoc.exists;
        if (simGone) {
          const curPrice = getPrice(allPrices, lt.signalSymbol, exchange) ?? lt.entryPrice;
          const closeResult = await protectiveClose(lt, "MARKET_TURN", curPrice, creds);
          if (closeResult.updatedFields.status === "CLOSED") {
            const orphanEvents = [...(lt.events || []), closeResult.newEvent];
            const orphanAggBefore: TradeAggregateSnapshot = { ...lt };
            await db.collection("live_trades").doc(lt.id!).update({
              ...closeResult.updatedFields,
              events: orphanEvents,
            });
            await applyTradeChangeToAggregates(db, orphanAggBefore, {
              ...orphanAggBefore,
              ...closeResult.updatedFields,
              events: orphanEvents,
            });
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "ORPHANED_LIVE_CLOSE",
              details: `${lt.signalSymbol} ${lt.side} closed — no linked simulator trade found (simTradeId=${lt.simTradeId})${closeResult.warning ? ` — ${closeResult.warning}` : ""}`,
              symbol: lt.signalSymbol,
              userId,
              exchange,
              assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
            });
            Object.assign(lt, closeResult.updatedFields);
            lt.status = "CLOSED";
            result.simCloseSynced++;
            await reconcileClosedTradePnlBestEffort(db, lt.id!, lt, exchange, creds);
          } else {
            result.errors.push(
              `${lt.signalSymbol}: orphaned close failed${closeResult.warning ? ` — ${closeResult.warning}` : ""} (will retry)`
            );
          }
          continue;
        }

        const sim = simDoc.data() as SimTrade;

        // Live should mirror EVERY sim close that represents a strategy
        // decision the venue can't see — sim is the source of truth, live
        // is the executor. We only sit out closes that already have their
        // own live-side propagation path (otherwise we'd double-close):
        //
        //   - `TP1` / `TP2` / `TP3`: exchange TP orders handle the partials;
        //     mirroring would race with the actual fill.
        //   - `SL` / `TRAILING_SL`: mirror when sim closes but live is still
        //     OPEN (missed fill, sync lag, or trailing stop on sim only).
        //   - `KILL_SWITCH`: `sim/force-close/route.ts` already cascades
        //     the close to every linked live trade inline.
        //   - `SYNCED_FROM_EXCHANGE`: admin manually reconciled one trade;
        //     not a strategy signal, no broadcast intended.
        //   - `EOD_SQUARE_OFF`: Indian-stocks 3:15 PM IST close, kept for
        //     backwards compat; Dhan live mirroring is paused.
        //
        // Everything else mirrors (including `SL` and `TRAILING_SL`).
        const NON_MIRRORED_SIM_CLOSE_REASONS = new Set([
          "TP1", "TP2", "TP3",
          "KILL_SWITCH",
          "SYNCED_FROM_EXCHANGE",
          "EOD_SQUARE_OFF",
        ]);
        if (sim.status !== "CLOSED") continue;
        if (!sim.closeReason) continue;
        if (NON_MIRRORED_SIM_CLOSE_REASONS.has(sim.closeReason)) continue;

        // `protectiveClose`'s reason type covers mirror-able sim close reasons
        // (`SL`, `TRAILING_SL`, zone exits, etc.). If sim writes a tag outside that
        // union (a future strategy we haven't taught the live engine
        // about yet) the cast keeps mirroring working — `protectiveClose`
        // only uses the reason for the event's `type` field and the
        // persisted `closeReason`, never for branching logic.
        const closeReason = sim.closeReason as Parameters<typeof protectiveClose>[1];
        const curPrice = getPrice(allPrices, lt.signalSymbol, exchange) ?? lt.entryPrice;
        const closeResult = await protectiveClose(lt, closeReason, curPrice, creds);

        if (closeResult.updatedFields.status === "CLOSED") {
          const trailEvents = [...(lt.events || []), closeResult.newEvent];
          const trailAggBefore: TradeAggregateSnapshot = { ...lt };
          await db.collection("live_trades").doc(lt.id!).update({
            ...closeResult.updatedFields,
            events: trailEvents,
          });
          await applyTradeChangeToAggregates(db, trailAggBefore, {
            ...trailAggBefore,
            ...closeResult.updatedFields,
            events: trailEvents,
          });
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: `SIM_${closeReason}_CLOSE`,
            details: `${lt.signalSymbol} ${lt.side} closed (sim-driven: ${closeReason})${closeResult.warning ? ` — ${closeResult.warning}` : ""}`,
            symbol: lt.signalSymbol,
            userId,
            exchange,
            assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
          });
          Object.assign(lt, closeResult.updatedFields);
          lt.status = "CLOSED";
          result.simCloseSynced++;
          await reconcileClosedTradePnlBestEffort(db, lt.id!, lt, exchange, creds);
        } else {
          // Market close failed — Firestore not updated → will retry next cycle
          result.errors.push(
            `${lt.signalSymbol}: sim-driven close (${closeReason}) failed${closeResult.warning ? ` — ${closeResult.warning}` : ""} (will retry)`
          );
        }
      } catch (closeSyncErr) {
        const errMsg = closeSyncErr instanceof Error ? closeSyncErr.message : String(closeSyncErr);
        result.errors.push(`${lt.signalSymbol} close-sync: ${errMsg}`);
      }
    }

    // ── 5. Daily loss limit / auto kill switch ──────────────
    try {
      const dailyLossLimit = resolveDailyLossLimit(userSettings.dailyLossLimit) / 100;

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const closedTodaySnap = await db.collection("live_trades")
        .where("status", "==", "CLOSED")
        .where("userId", "==", userId)
        .where("exchange", "==", exchange)
        .where("closedAt", ">=", todayStart.toISOString())
        .get();

      let dailyRealizedPnl = 0;
      for (const d of closedTodaySnap.docs) {
        dailyRealizedPnl += (d.data().realizedPnl ?? 0) - (d.data().fees ?? 0);
      }

      let unrealizedPnl = 0;
      for (const t of liveTrades) {
        if (t.status !== "OPEN") continue;
        const lp = getPrice(allPrices, t.signalSymbol, exchange) ?? t.entryPrice;
        const priceDiff = t.side === "BUY" ? lp - t.entryPrice : t.entryPrice - lp;
        // remainingQty is in base coin units → priceDiff * remainingQty is
        // already in quote currency. No leverage multiplier needed.
        unrealizedPnl += priceDiff * t.remainingQty;
      }

      const totalDailyPnl = dailyRealizedPnl + unrealizedPnl;
      const capitalBase = liveTrades[0]?.capitalAtEntry ?? 1000;
      const dailyDrawdown = -totalDailyPnl / capitalBase;

      if (dailyDrawdown >= dailyLossLimit) {
        const stillOpen = liveTrades.filter((t) => t.status === "OPEN");
        for (const trade of stillOpen) {
          const curPrice = getPrice(allPrices, trade.signalSymbol, exchange) ?? trade.entryPrice;
          const closeResult = await protectiveClose(trade, "KILL_SWITCH", curPrice, creds);
          const ksEvents = [...(trade.events || []), closeResult.newEvent];
          const ksAggBefore: TradeAggregateSnapshot = { ...trade };
          await db.collection("live_trades").doc(trade.id!).update({
            ...closeResult.updatedFields,
            events: ksEvents,
          });
          await applyTradeChangeToAggregates(db, ksAggBefore, {
            ...ksAggBefore,
            ...closeResult.updatedFields,
            events: ksEvents,
          });
          Object.assign(trade, closeResult.updatedFields);
          trade.status = "CLOSED";
          result.protectiveCloses++;
          await reconcileClosedTradePnlBestEffort(db, trade.id!, trade, exchange, creds);
        }

        // Halt new entries for the rest of today (UTC) — keep autoTradeEnabled on
        // so FreedomBot stays "Live" and resumes automatically tomorrow.
        const killDocIds = getSecretDocIds(exchange);
        for (const killId of killDocIds) {
          const killRef = db.collection("users").doc(userId).collection("secrets").doc(killId);
          const killDoc = await killRef.get();
          if (killDoc.exists && docMatchesExchange(killDoc.data()!, exchange, killId)) {
            await killRef.update(dailyLossHaltPatchForToday());
            break;
          }
        }

        // Telegram alerts
        try {
          const userDoc = await db.collection("users").doc(userId).get();
          const chatId = userDoc.data()?.telegramChatId;
          if (chatId) {
            const msg = `🚨 <b>Daily loss cap reached</b> 🚨\n\n` +
              `Exchange: <b>${exchange}</b>\n` +
              `Daily loss: <b>${(dailyDrawdown * 100).toFixed(1)}%</b> (limit: ${(dailyLossLimit * 100).toFixed(0)}%)\n` +
              `Daily PnL: <b>$${totalDailyPnl.toFixed(2)}</b>\n` +
              `Positions closed: <b>${stillOpen.length}</b>\n\n` +
              `⏸ New trades are paused for the rest of today (UTC).\n` +
              `Your bot stays on — trading resumes automatically tomorrow.`;
            await sendMessage(chatId, msg);
          }
        } catch (tgErr) {
          console.error(`[LiveSync] Telegram kill switch alert failed for ${userId}:`, tgErr);
        }

        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "AUTO_KILL_SWITCH",
          details: `Daily loss ${(dailyDrawdown * 100).toFixed(1)}% >= limit ${(dailyLossLimit * 100).toFixed(0)}%. Closed ${stillOpen.length} positions. New entries halted for today (UTC).`,
          userId,
          exchange,
          assetType: exchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
        });
      }
    } catch (killErr) {
      console.error(`[LiveSync] Auto kill switch check failed for ${userId}/${exchange}:`, killErr);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
  }

  return result;
}

/**
 * CRON 3: MULTI-USER, MULTI-EXCHANGE LIVE TRADE MANAGEMENT
 *
 * 1. Queries all users with autoTradeEnabled on any exchange
 * 2. Processes all user×exchange pairs in parallel
 * 3. Each pair runs independently — one user's failure doesn't block others
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const startedAt = Date.now();

  try {
    // ── 1. Read cached prices ───────────────────────────────
    let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), COINDCX: new Map(), HYPERLIQUID: new Map(), DHAN: new Map() };
    try {
      const priceDoc = await db.collection("config").doc("exchange_prices").get();
      if (priceDoc.exists) {
        allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
      }
    } catch (e) {
      console.warn(
        `[LiveSync] Failed to read cached prices — proceeding with empty maps: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // ── 2. Fetch signals and compute live scores ─────────────
    // We compute scores the same way the sim sync does so that
    // currentScore + currentScorePattern on live trades always
    // reflect the latest pattern evaluation, not stale Firestore fields.
    // Only ACTIVE signals — resolved signals don't need re-scoring and
    // pulling the full signals collection every minute is the main cause
    // of bloated Firestore read bills.
    const liveScores = new Map<string, { score: number; pattern: string | null }>();
    try {
      const signalsSnap = await db
        .collection("signals")
        .where("status", "==", "ACTIVE")
        .get();
      const postUpdateDocs = signalsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
      const rawLiveScores = computeAutoFilter(allSignalsForScoring, { includeResolved: true });

      for (const [id, entry] of rawLiveScores.entries()) {
        liveScores.set(id, {
          score: entry.score,
          pattern: entry.breakdown?.pattern ?? null,
        });
      }
    } catch (e) {
      console.warn(
        `[LiveSync] Failed to fetch ACTIVE signals — live scores will be empty this tick: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // ── 3. Find all users with auto-trade enabled ───────────
    // Check each supported exchange's secrets collection
    interface UserExchangePair {
      userId: string;
      exchange: ExchangeName;
      creds: Credentials;
      settings: { dailyLossLimit: number };
    }

    const pairs: UserExchangePair[] = [];

    // Discover users with auto-trade enabled via a single collection-group
    // query against the `secrets` subcollection, instead of fetching every
    // user × every exchange × every legacy doc id (which costs ~6k reads/min).
    //
    // Each result contains both the credentials and the parent userId via
    // `doc.ref.parent.parent.id`. Requires a Firestore single-field index
    // exemption is not needed; collection-group + simple equality is supported
    // out of the box.
    // Dhan deliberately excluded — Indian-market live trading is paused.
    // Re-add `dhan: "DHAN"` here (plus restore the token-regen path below)
    // when reviving Indian stock support.
    const DOC_ID_TO_EXCHANGE: Record<string, ExchangeName> = {
      bybit:           "BYBIT",
      binance:         "BYBIT",   // legacy pre-migration doc
      binance_futures: "BINANCE",
      mexc:            "MEXC",
      coindcx:         "COINDCX",
      hyperliquid:     "HYPERLIQUID",
    };

    let enabledSnap: FirebaseFirestore.QuerySnapshot;
    try {
      enabledSnap = await db
        .collectionGroup("secrets")
        .where("autoTradeEnabled", "==", true)
        .get();
    } catch (e) {
      console.error(
        `[LiveSync] FATAL: collectionGroup(secrets) query failed — cannot discover auto-trade users this tick: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      const errMsg = e instanceof Error ? e.message : String(e);
      const errCode = (e as { code?: unknown })?.code ?? null;
      const errDetails = (e as { details?: unknown })?.details ?? null;
      const errStack = (e as { stack?: unknown })?.stack ?? null;
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "Live Trade Sync: enabledSnap query failed",
        details: errMsg,
        errorCode: errCode,
        errorDetails: errDetails,
        errorStack: errStack,
        webhookId: "SYSTEM_CRON",
      }).catch(() => {});
      return NextResponse.json({
        success: false,
        error: errMsg,
        code: errCode,
        details: errDetails,
        hint: "collectionGroup(secrets).where(autoTradeEnabled,==,true) failed. Most likely a missing Firestore index — see errorDetails for the create-index URL.",
      }, { status: 500 });
    }

    // Dedupe by (userId, exchange) — BYBIT can match both `bybit` and legacy
    // `binance` docs; we only want one credential pair per exchange per user.
    const seen = new Set<string>();

    const enabledChecks = enabledSnap.docs.map(async (secretDoc) => {
      const data = secretDoc.data() ?? {};
      const userId = secretDoc.ref.parent.parent?.id;
      if (!userId) return;

      const exchangeName = DOC_ID_TO_EXCHANGE[secretDoc.id];
      if (!exchangeName) return;
      if (!docMatchesExchange(data, exchangeName, secretDoc.id)) return;

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      try {
        const apiKey = decrypt(data.encryptedKey);
        const apiSecret = decrypt(data.encryptedSecret);

        pairs.push({
          userId,
          exchange: exchangeName,
          creds: {
            apiKey,
            apiSecret,
            testnet: data.useTestnet === true,
          },
          settings: {
            dailyLossLimit: resolveDailyLossLimit(data.dailyLossLimit),
          },
        });
      } catch {
        // skip this exchange for this user
      }
    });

    await Promise.all(enabledChecks);

    if (pairs.length === 0) {
      return NextResponse.json({ success: true, message: "No active auto-trade users", pairs: 0 });
    }

    // Per-deployment wallet-balance heartbeat + `exchangeUid` backfill used
    // to live here as "step 3b" — a fan-out over every (user, exchange)
    // pair on every minute, even on idle ticks. None of that work touches
    // trade lifecycle, so it now runs on its own schedule in
    // `/api/cron/sync-wallet-balances` (15-min cadence, same 30-min
    // per-deployment throttle on the actual venue call).
    //
    // We keep the *opportunistic* refresh below: any tick where a fill
    // or protective close lands, we look up the active deployment doc
    // inline and refresh wallet balance immediately so the admin
    // dashboard reflects the real post-trade balance without waiting
    // for the wallet cron's next tick. That inline lookup only fires
    // when something actually changed, so it adds zero load on idle
    // ticks.

    // ── 4. Process all user×exchange pairs in parallel ──────
    const results = await Promise.allSettled(
      pairs.map((pair) =>
        syncUserTrades(
          pair.userId,
          pair.exchange,
          pair.creds,
          pair.settings,
          allPrices,
          liveScores,
          db
        ).then(async (r) => {
          // Opportunistic wallet refresh: any time a fill landed or a
          // protective close fired, the wallet balance just changed.
          // Refresh it now (bypassing the 30-min throttle that the
          // `sync-wallet-balances` cron honors) so the admin dashboard
          // reflects the real post-trade balance without waiting for
          // the next heartbeat. We do a small inline `bot_deployments`
          // lookup — it only fires when something actually happened, so
          // it's effectively free on idle ticks.
          if (r.fills > 0 || r.protectiveCloses > 0) {
            try {
              const deploySnap = await db
                .collection("bot_deployments")
                .where("uid", "==", pair.userId)
                .where("exchange", "==", pair.exchange)
                .where("status", "==", "active")
                .limit(1)
                .get();
              if (!deploySnap.empty) {
                await refreshDeploymentWalletBalance(
                  db,
                  deploySnap.docs[0].ref,
                  pair.exchange,
                  pair.creds,
                ).catch(() => {
                  /* best-effort; wallet cron will catch it within 15m */
                });
              }
            } catch {
              /* best-effort; wallet cron will catch it within 15m */
            }
          }
          return { ...r, userId: pair.userId, exchange: pair.exchange };
        })
      )
    );

    // ── 5. Aggregate results ────────────────────────────────
    let totalFills = 0;
    let totalUpdates = 0;
    let totalProtective = 0;
    let totalSimSlSynced = 0;
    let totalSimCloseSynced = 0;
    let totalErrors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalFills += r.value.fills;
        totalUpdates += r.value.updates;
        totalProtective += r.value.protectiveCloses;
        totalSimSlSynced += r.value.simSlSynced;
        totalSimCloseSynced += r.value.simCloseSynced;
        totalErrors += r.value.errors.length;

        if (r.value.errors.length > 0) {
          console.error(`[LiveSync] Errors for ${r.value.userId}/${r.value.exchange}:`, r.value.errors);
        }
      } else {
        totalErrors++;
        console.error(`[LiveSync] User sync failed:`, r.reason);
      }
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `LIVE SYNC: pairs=${pairs.length} fills=${totalFills} updates=${totalUpdates} protective=${totalProtective} simSlSynced=${totalSimSlSynced} simCloseSynced=${totalSimCloseSynced} errors=${totalErrors}`,
      webhookId: "SYSTEM_CRON",
    });

    await recordCronHeartbeat(db, "sync-live-trades", {
      ok: true,
      degraded: totalErrors > 0,
      summary: `pairs=${pairs.length} fills=${totalFills} errors=${totalErrors}`,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      pairs: pairs.length,
      fills: totalFills,
      updates: totalUpdates,
      protectiveCloses: totalProtective,
      simSlSynced: totalSimSlSynced,
      simCloseSynced: totalSimCloseSynced,
      errors: totalErrors,
    });
  } catch (error: unknown) {
    // Surface every byte of context the SDK gives us. Firestore's
    // FAILED_PRECONDITION error includes the index-creation URL in its
    // `message` / `details` field, but plain `error.message` sometimes
    // collapses to just "9 FAILED_PRECONDITION:" if the SDK serialised the
    // error before populating the body. We log code, message, details, stack,
    // and the original error JSON so future failures are debuggable from the
    // logs collection alone.
    const e = error as {
      message?: string;
      code?: number | string;
      details?: string;
      stack?: string;
      metadata?: unknown;
    };
    const fullMessage =
      e?.message ||
      (typeof e?.details === "string" ? e.details : "") ||
      String(error);
    try {
      console.error("[LiveSync] FATAL", error);
    } catch {
      // ignore logging failure
    }
    try {
      await recordCronHeartbeat(db, "sync-live-trades", {
        ok: false,
        error: fullMessage,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* heartbeat must not block error path */
    }
    try {
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "Live Trade Sync Failure",
        details: fullMessage,
        errorCode: e?.code ?? null,
        errorDetails: e?.details ?? null,
        errorStack: e?.stack ?? null,
        errorRaw: (() => {
          try {
            return JSON.stringify(error, Object.getOwnPropertyNames(error as object)).slice(0, 8000);
          } catch {
            return null;
          }
        })(),
        webhookId: "SYSTEM_CRON",
      });
    } catch {
      // Firestore write itself failed — give up on persisting the log.
    }
    return NextResponse.json(
      { success: false, error: fullMessage, code: e?.code ?? null },
      { status: 500 },
    );
  }
}
