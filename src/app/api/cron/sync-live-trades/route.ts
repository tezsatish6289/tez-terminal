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
import { decrypt, encrypt } from "@/lib/crypto";
import { generateTokenForUser } from "@/lib/dhan-token";
import { sendMessage } from "@/lib/telegram";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  STOCK_EXCHANGES,
  deserializePrices,
  getPrice,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  replaceSl,
  type AllExchangePrices,
} from "@/lib/exchanges";
import { isIndianMarketOpen, isIndianSquareOffTime } from "@/lib/market-hours";
import {
  computeClosedTradeExchangePnlMetrics,
  exchangeReconcileOrderIdsFromLiveTrade,
  coindcxClosedPnlWindowOpts,
  bybitClosedPnlWindowOpts,
  bybitClosedPnlApiEndMs,
  exchangeClosedPnlFetchStartMs,
  reconcileTradeExchangePnl,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import {
  applyTradeChangeToAggregates,
  type TradeAggregateSnapshot,
} from "@/lib/freedombot/aggregates";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";

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

    // ── 0. Backfill actual exchange data for closed trades ───────
    // Fetches real PnL, entry/exit prices, and qty from the exchange for
    // any closed trade missing exchangeRealizedPnl.
    //
    // For each attempted trade we bump `exchangePnlReconcileAttempts` so we can
    // see in Firestore which trades have been retrying without success. Capped
    // at 50/cycle to balance freshness vs. rate-limiting (Bybit ~120 req/sec).
    // Best-effort: never blocks open-trade sync.
    if (getConnector(exchange).getClosedPnl) {
      try {
        const missingSnap = await db.collection("live_trades")
          .where("status", "==", "CLOSED")
          .where("userId", "==", userId)
          .where("exchange", "==", exchange)
          .where("exchangeRealizedPnl", "==", null)
          .limit(50)
          .get();

        const connector = getConnector(exchange);
        for (const doc of missingSnap.docs) {
          const lt = { id: doc.id, ...doc.data() } as LiveTrade;
          const nowIso = new Date().toISOString();
          try {
            const openedAtMs = new Date(lt.openedAt).getTime();
            const closedAtMs = lt.closedAt ? new Date(lt.closedAt).getTime() : Date.now();
            if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) continue;

            const endArg = exchange === "BYBIT" ? bybitClosedPnlApiEndMs(closedAtMs) : undefined;
            const records = await connector.getClosedPnl!(
              lt.symbol,
              creds,
              exchangeClosedPnlFetchStartMs(exchange, openedAtMs),
              endArg,
            );
            const metrics = computeClosedTradeExchangePnlMetrics(records, openedAtMs, closedAtMs, {
              tradeSide:
                String(lt.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
              // Both Bybit and CoinDCX expose the order id on their PnL rows now,
              // so prefer exact id match for either venue.
              matchAnyOrderId:
                exchange === "BYBIT" || exchange === "COINDCX"
                  ? exchangeReconcileOrderIdsFromLiveTrade(lt as unknown as Record<string, unknown>)
                  : undefined,
              ...(exchange === "COINDCX" ? coindcxClosedPnlWindowOpts() : {}),
              ...(exchange === "BYBIT" ? bybitClosedPnlWindowOpts() : {}),
            });

            if (metrics.recordCount === 0) {
              // Track that we tried — useful for debugging perma-stuck trades.
              await doc.ref.update({
                exchangePnlReconcileAttempts: FieldValue.increment(1),
                exchangePnlReconcileLastAttemptAt: nowIso,
              });
              continue;
            }

            const patch: Record<string, unknown> = {
              exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
              exchangePnlReconciledAt: nowIso,
              exchangePnlSource: "exchange_closed_pnl_api",
              exchangePnlReconcileLastAttemptAt: nowIso,
            };
            if (metrics.exchangeAvgEntryPrice != null) {
              patch.exchangeAvgEntryPrice = metrics.exchangeAvgEntryPrice;
            }
            if (metrics.exchangeAvgExitPrice != null) {
              patch.exchangeAvgExitPrice = metrics.exchangeAvgExitPrice;
            }
            if (metrics.exchangeQty != null) {
              patch.exchangeQty = metrics.exchangeQty;
            }
            await doc.ref.update(patch);
          } catch (reconErr) {
            try {
              await doc.ref.update({
                exchangePnlReconcileAttempts: FieldValue.increment(1),
                exchangePnlReconcileLastAttemptAt: nowIso,
                exchangePnlReconcileLastError:
                  reconErr instanceof Error ? reconErr.message : String(reconErr),
              });
            } catch {
              // best effort
            }
          }
        }
      } catch {
        // best effort — never block main sync
      }
    }

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
    // If the simulator has closed a trade for risk reasons (trailing SL crossed,
    // market turned, score degraded), close the matching live trade immediately.
    // This is the primary close-sync path — the market-turn and score-degradation
    // blocks below act as independent safety nets.
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

        // Reasons that should cascade a market close into the live
        // mirror. Pattern bot: TRAILING_SL only (market-turn and
        // pattern-break exits were removed — let the actual SL do its
        // job rather than booking premature small losses). Zone bots
        // own their entire lifecycle so their explicit exit reasons
        // must also propagate: ZONE_BOT_FLIP (direction reversed,
        // close immediately) and ZONE_BOT_MAX_PAIN_EXIT (one-sided
        // zone reached max-pain proximity, exit before chop).
        const MIRRORED_SIM_CLOSE_REASONS = new Set([
          "TRAILING_SL",
          "ZONE_BOT_FLIP",
          "ZONE_BOT_MAX_PAIN_EXIT",
        ]);
        if (sim.status !== "CLOSED") continue;
        if (!sim.closeReason || !MIRRORED_SIM_CLOSE_REASONS.has(sim.closeReason)) continue;

        const closeReason = sim.closeReason as "TRAILING_SL" | "ZONE_BOT_FLIP" | "ZONE_BOT_MAX_PAIN_EXIT";
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
      const dailyLossLimit = (userSettings.dailyLossLimit ?? 5) / 100;

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

        // Disable auto-trade for this exchange
        const killDocIds = getSecretDocIds(exchange);
        for (const killId of killDocIds) {
          const killRef = db.collection("users").doc(userId).collection("secrets").doc(killId);
          const killDoc = await killRef.get();
          if (killDoc.exists && docMatchesExchange(killDoc.data()!, exchange, killId)) {
            await killRef.update({ autoTradeEnabled: false });
            break;
          }
        }

        // Telegram alerts
        try {
          const userDoc = await db.collection("users").doc(userId).get();
          const chatId = userDoc.data()?.telegramChatId;
          if (chatId) {
            const msg = `🚨 <b>AUTO KILL SWITCH TRIGGERED</b> 🚨\n\n` +
              `Exchange: <b>${exchange}</b>\n` +
              `Daily loss limit breached: <b>${(dailyDrawdown * 100).toFixed(1)}%</b> (limit: ${(dailyLossLimit * 100).toFixed(0)}%)\n` +
              `Daily PnL: <b>$${totalDailyPnl.toFixed(2)}</b>\n` +
              `Positions closed: <b>${stillOpen.length}</b>\n\n` +
              `⛔ Auto-trade on ${exchange} has been <b>DISABLED</b>.\n` +
              `Re-enable manually from Settings when ready.`;
            await sendMessage(chatId, msg);
            await new Promise((r) => setTimeout(r, 2000));
            await sendMessage(chatId, `🚨 REMINDER: Auto-trade on ${exchange} KILLED. ${stillOpen.length} positions closed. Daily loss: $${totalDailyPnl.toFixed(2)}`);
          }
        } catch (tgErr) {
          console.error(`[LiveSync] Telegram kill switch alert failed for ${userId}:`, tgErr);
        }

        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "AUTO_KILL_SWITCH",
          details: `Daily loss ${(dailyDrawdown * 100).toFixed(1)}% >= limit ${(dailyLossLimit * 100).toFixed(0)}%. Closed ${stillOpen.length} positions. Auto-trade disabled.`,
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

  try {
    // ── 1. Read cached prices ───────────────────────────────
    const priceDoc = await db.collection("config").doc("exchange_prices").get();
    let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), COINDCX: new Map(), HYPERLIQUID: new Map(), DHAN: new Map() };
    if (priceDoc.exists) {
      allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
    }

    // ── 2. Fetch signals and compute live scores ─────────────
    // We compute scores the same way the sim sync does so that
    // currentScore + currentScorePattern on live trades always
    // reflect the latest pattern evaluation, not stale Firestore fields.
    // Only ACTIVE signals — resolved signals don't need re-scoring and
    // pulling the full signals collection every minute is the main cause
    // of bloated Firestore read bills.
    const signalsSnap = await db
      .collection("signals")
      .where("status", "==", "ACTIVE")
      .get();
    const postUpdateDocs = signalsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
    const rawLiveScores = computeAutoFilter(allSignalsForScoring, { includeResolved: true });

    // Convert to a simpler map: signalId → { score, pattern }
    const liveScores = new Map<string, { score: number; pattern: string | null }>();
    for (const [id, entry] of rawLiveScores.entries()) {
      liveScores.set(id, {
        score: entry.score,
        pattern: entry.breakdown?.pattern ?? null,
      });
    }

    // ── 3a. 3:15 PM IST square-off: force-close open Dhan 5-min intraday positions ──
    // Only 5-min chart trades are squared off — longer timeframes managed separately.
    if (isIndianSquareOffTime()) {
      console.log("[LiveSync] 3:15 PM IST square-off window — closing open Dhan 5m intraday positions.");

      const openDhanTrades = await db.collection("live_trades")
        .where("status", "==", "OPEN")
        .where("exchange", "==", "DHAN")
        .get();

      // Filter to only 5-min chart trades
      const fiveMinTrades = openDhanTrades.docs.filter((d) => {
        const tf = d.data().timeframe;
        return String(tf) === "5";
      });

      if (fiveMinTrades.length > 0) {
        const squareOffResults = await Promise.allSettled(
          fiveMinTrades.map(async (tradeDoc) => {
            const lt = { id: tradeDoc.id, ...tradeDoc.data() } as LiveTrade;

            // Get user's Dhan credentials
            const userId = lt.userId as string;
            let creds: { apiKey: string; apiSecret: string; testnet: boolean } | null = null;

            const dhanSecretDoc = await db.collection("users").doc(userId)
              .collection("secrets").doc("dhan").get().catch(() => null);

            if (dhanSecretDoc?.exists) {
              const d = dhanSecretDoc.data()!;
              const clientId = decrypt(d.encryptedKey);

              if (d.encryptedPin) {
                let accessToken: string | null = null;
                if (d.encryptedCachedToken && d.cachedTokenExpiresAt) {
                  const expiresAt = new Date(d.cachedTokenExpiresAt as string).getTime();
                  if (Date.now() < expiresAt - 5 * 60 * 1000) {
                    try { accessToken = decrypt(d.encryptedCachedToken); } catch { /* stale */ }
                  }
                }
                if (!accessToken) {
                  const { token } = await generateTokenForUser(clientId, decrypt(d.encryptedSecret), decrypt(d.encryptedPin));
                  accessToken = token;
                }
                if (accessToken) creds = { apiKey: accessToken, apiSecret: clientId, testnet: false };
              } else {
                creds = { apiKey: decrypt(d.encryptedKey), apiSecret: decrypt(d.encryptedSecret), testnet: false };
              }
            }

            if (!creds) {
              console.warn(`[LiveSync] Square-off: no valid Dhan creds for user ${userId}, trade ${lt.id}`);
              return;
            }

            try {
              const connector = getConnector("DHAN");
              await connector.cancelAllOrders(lt.signalSymbol, creds);
              await connector.placeMarketClose(lt.signalSymbol, lt.side, lt.quantity, creds);

              const closePrice = getPrice(allPrices, lt.signalSymbol, "DHAN") ?? lt.entryPrice;
              const isBuy = lt.side === "BUY";
              const priceDiff = isBuy ? closePrice - lt.entryPrice : lt.entryPrice - closePrice;
              // Realised PnL = priceMove% * notional. `positionSize` is the
              // notional value at entry, so no leverage multiplier required.
              const realizedPnl = (priceDiff / lt.entryPrice) * lt.positionSize;
              const now = new Date().toISOString();

              const eodPatch = {
                status: "CLOSED" as const,
                closeReason: "EOD_SQUARE_OFF",
                closedAt: now,
                exitPrice: closePrice,
                realizedPnl: Math.round(realizedPnl * 100) / 100,
              };
              const eodAggBefore: TradeAggregateSnapshot = { ...lt };
              await db.collection("live_trades").doc(lt.id!).update(eodPatch);
              await applyTradeChangeToAggregates(db, eodAggBefore, {
                ...eodAggBefore,
                ...eodPatch,
              });

              await db.collection("live_trade_logs").add({
                timestamp: now,
                action: "EOD_SQUARE_OFF",
                details: `${lt.signalSymbol} ${lt.side} force-closed @ ₹${closePrice} for EOD square-off. PnL: ₹${realizedPnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange: "DHAN",
                assetType: "INDIAN_STOCKS",
              });
            } catch (err) {
              console.error(`[LiveSync] Square-off failed for ${lt.signalSymbol} (${lt.id}):`, err);
            }
          })
        );

        const soOk = squareOffResults.filter((r) => r.status === "fulfilled").length;
        console.log(`[LiveSync] Square-off complete: ${soOk}/${fiveMinTrades.length} 5m positions closed.`);
      }
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
    const DOC_ID_TO_EXCHANGE: Record<string, ExchangeName> = {
      bybit:           "BYBIT",
      binance:         "BYBIT",   // legacy pre-migration doc
      binance_futures: "BINANCE",
      mexc:            "MEXC",
      coindcx:         "COINDCX",
      hyperliquid:     "HYPERLIQUID",
      dhan:            "DHAN",
    };

    const enabledSnap = await db
      .collectionGroup("secrets")
      .where("autoTradeEnabled", "==", true)
      .get();

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
      if (STOCK_EXCHANGES.includes(exchangeName) && !isIndianMarketOpen()) return;

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      try {
        let apiKey: string;
        let apiSecret: string;

        if (exchangeName === "DHAN") {
          // Dhan: stored as clientId (key) + totpSecret (secret) + pin.
          // Auto-generate a fresh JWT token; cache it for 24h so we
          // don't hit Dhan's auth API on every cron tick.
          const clientId = decrypt(data.encryptedKey);
          const totpSecret = data.encryptedSecret ? decrypt(data.encryptedSecret) : null;
          const pin = data.encryptedPin ? decrypt(data.encryptedPin) : null;

          let accessToken: string | null = null;

          if (data.encryptedCachedToken && data.cachedTokenExpiresAt) {
            const expiresAt = new Date(data.cachedTokenExpiresAt as string).getTime();
            if (Date.now() < expiresAt - 5 * 60 * 1000) {
              try { accessToken = decrypt(data.encryptedCachedToken); } catch { /* stale */ }
            }
          }

          if (!accessToken && totpSecret && pin) {
            const { token } = await generateTokenForUser(clientId, totpSecret, pin);
            accessToken = token;
            if (accessToken) {
              await secretDoc.ref.update({
                encryptedCachedToken: encrypt(accessToken),
                cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              });
            }
          }

          if (!accessToken) {
            console.error(`[LiveSync] Could not obtain Dhan token for user ${userId} — skipping.`);
            return;
          }

          // DhanConnector expects: apiKey = access token, apiSecret = clientId
          apiKey = accessToken;
          apiSecret = clientId;
        } else {
          apiKey = decrypt(data.encryptedKey);
          apiSecret = decrypt(data.encryptedSecret);
        }

        pairs.push({
          userId,
          exchange: exchangeName,
          creds: {
            apiKey,
            apiSecret,
            testnet: data.useTestnet === true,
          },
          settings: {
            dailyLossLimit: data.dailyLossLimit ?? 5,
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

    // ── 3b. Per-deployment background refresh ─────────────────────────────────
    // Runs best-effort against the deployment doc for each user×exchange we
    // discovered. Two responsibilities, batched into a single Firestore
    // lookup per pair:
    //   1. Lazy backfill of `exchangeUid` for venues that expose a stable
    //      account id (Bybit/CoinDCX/Hyperliquid) — only done once per
    //      deployment; subsequent ticks short-circuit.
    //   2. Wallet-balance heartbeat. Calls `connector.getUsdtBalance(creds)`
    //      AT MOST every 30 minutes per deployment and persists the result
    //      onto the `bot_deployments` doc so the admin dashboard can show
    //      live connection health (`walletStatus: "valid" | "invalid"`,
    //      `walletTotal`, `walletAvailable`, `walletError`,
    //      `walletCheckedAt`). The opportunistic refresh after each trade
    //      open/close keeps the displayed balance fresh between heartbeats.
    // We deliberately cap concurrency to 5 so we never burst past venue
    // rate limits (CoinDCX is the tightest at ~10 req/sec per IP, and we
    // share Vercel's outbound IP across every active deployment).
    // Nothing in here can fail in a way that blocks trade processing.
    const WALLET_REFRESH_THROTTLE_MS = 30 * 60 * 1000;
    const WALLET_REFRESH_CONCURRENCY = 5;
    const walletDeployRefByUserExchange = new Map<
      string,
      FirebaseFirestore.DocumentReference
    >();
    const walletRefreshStats = {
      attempted: 0,
      throttled: 0,
      valid: 0,
      invalid: 0,
      missingDeployment: 0,
    };
    {
      let idx = 0;
      const workers: Promise<void>[] = [];
      const runOne = async (pair: UserExchangePair) => {
        try {
          const deploySnap = await db
            .collection("bot_deployments")
            .where("uid", "==", pair.userId)
            .where("exchange", "==", pair.exchange)
            .where("status", "==", "active")
            .limit(1)
            .get();

          if (deploySnap.empty) {
            walletRefreshStats.missingDeployment++;
            return;
          }
          const deployDoc = deploySnap.docs[0];
          const deployData = deployDoc.data();
          walletDeployRefByUserExchange.set(
            `${pair.userId}::${pair.exchange}`,
            deployDoc.ref,
          );

          // (1) exchangeUid backfill — only for venues that expose it.
          if (
            (pair.exchange === "BYBIT" ||
              pair.exchange === "COINDCX" ||
              pair.exchange === "HYPERLIQUID") &&
            !deployData.exchangeUid
          ) {
            try {
              const connector = getConnector(pair.exchange) as {
                getAccountUid?: (c: Credentials) => Promise<string | null>;
              };
              if (connector.getAccountUid) {
                const exchangeUid = await connector.getAccountUid(pair.creds);
                if (exchangeUid) {
                  await deployDoc.ref.update({ exchangeUid });
                  console.log(
                    `[LiveSync] Backfilled exchangeUid for user ${pair.userId} (${pair.exchange})`,
                  );
                }
              }
            } catch {
              // best-effort
            }
          }

          // (2) Wallet-balance heartbeat — throttled per deployment.
          const lastCheckedAt =
            typeof deployData.walletCheckedAt === "string"
              ? deployData.walletCheckedAt
              : null;
          walletRefreshStats.attempted++;
          const refreshResult = await refreshDeploymentWalletBalance(
            db,
            deployDoc.ref,
            pair.exchange,
            pair.creds,
            {
              skipIfCheckedWithinMs: WALLET_REFRESH_THROTTLE_MS,
              existingCheckedAt: lastCheckedAt,
            },
          );
          if (refreshResult.skipped) walletRefreshStats.throttled++;
          else if (refreshResult.status === "valid") walletRefreshStats.valid++;
          else if (refreshResult.status === "invalid") walletRefreshStats.invalid++;
        } catch (e) {
          console.warn(
            `[LiveSync] Wallet refresh failed for ${pair.userId}/${pair.exchange}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      };
      const worker = async () => {
        while (idx < pairs.length) {
          const myIdx = idx++;
          await runOne(pairs[myIdx]!);
        }
      };
      for (let w = 0; w < Math.min(WALLET_REFRESH_CONCURRENCY, pairs.length); w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    }
    console.log(
      `[LiveSync] Wallet refresh: ${walletRefreshStats.valid} valid, ${walletRefreshStats.invalid} invalid, ${walletRefreshStats.throttled} throttled, ${walletRefreshStats.missingDeployment} no-deployment (of ${pairs.length} pairs)`,
    );

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
          // Refresh it now (bypassing the 30-min cron throttle) so the
          // admin dashboard reflects the real post-trade balance without
          // waiting for the next heartbeat. We already have creds in
          // hand, and this only fires when something actually happened,
          // so it adds zero traffic on idle ticks.
          if (r.fills > 0 || r.protectiveCloses > 0) {
            const deployRef = walletDeployRefByUserExchange.get(
              `${pair.userId}::${pair.exchange}`,
            );
            if (deployRef) {
              await refreshDeploymentWalletBalance(
                db,
                deployRef,
                pair.exchange,
                pair.creds,
              ).catch(() => {
                /* best-effort; heartbeat will catch it within 30m */
              });
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
  } catch (error: any) {
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Live Trade Sync Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
