import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  checkOrderFills,
  handleTpFill,
  handleSlFill,
  moveSlToBreakeven,
  protectiveClose,
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
  ALL_EXCHANGES,
  deserializePrices,
  getPrice,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  replaceSl,
  type AllExchangePrices,
} from "@/lib/exchanges";
import { isIndianMarketOpen, isIndianSquareOffTime } from "@/lib/market-hours";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    // ── 0. Backfill actual exchange data for closed trades ───────
    // Fetches real PnL, entry/exit prices, and qty from the exchange for
    // any closed trade missing exchangeRealizedPnl. Runs on ALL closed
    // trades (not just recent) so older trades are backfilled gradually.
    // Capped at 20 per cycle to avoid rate-limiting.
    // Best-effort: never blocks open-trade sync.
    if (getConnector(exchange).getClosedPnl) {
      try {
        const missingSnap = await db.collection("live_trades")
          .where("status", "==", "CLOSED")
          .where("userId", "==", userId)
          .where("exchange", "==", exchange)
          .where("exchangeRealizedPnl", "==", null)
          .limit(20)
          .get();

        const connector = getConnector(exchange);
        for (const doc of missingSnap.docs) {
          const lt = { id: doc.id, ...doc.data() } as LiveTrade;
          try {
            const startTime = new Date(lt.openedAt).getTime();
            const records = await connector.getClosedPnl!(lt.symbol, creds, startTime);
            if (records.length === 0) continue;

            const totalPnl = records.reduce((sum, r) => sum + r.closedPnl, 0);
            const totalQty = records.reduce((sum, r) => sum + r.qty, 0);
            // Weighted average entry/exit prices across all fill records
            const avgEntry = records.reduce((sum, r) => sum + r.avgEntryPrice * r.qty, 0) / totalQty;
            const avgExit  = records.reduce((sum, r) => sum + r.avgExitPrice  * r.qty, 0) / totalQty;

            await db.collection("live_trades").doc(doc.id).update({
              exchangeRealizedPnl:   parseFloat(totalPnl.toFixed(4)),
              exchangeAvgEntryPrice: parseFloat(avgEntry.toFixed(8)),
              exchangeAvgExitPrice:  parseFloat(avgExit.toFixed(8)),
              exchangeQty:           parseFloat(totalQty.toFixed(6)),
            });
          } catch {
            // best effort per trade
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
              await db.collection("live_trades").doc(lt.id!).update({
                ...slFields,
                events: [...(lt.events || []), slResult.newEvent],
              });
              await db.collection("live_trade_logs").add({
                timestamp: new Date().toISOString(),
                action: "SL_HIT",
                details: `${lt.signalSymbol} ${lt.side} SL hit @ $${fill.price} PnL: $${slResult.newEvent.pnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange,
              });
              lt.status = "CLOSED";
              result.fills++;
            } else {
              const tpLevel = fill.type === "TP1" ? 1 : fill.type === "TP2" ? 2 : 3;
              const tpResult = await handleTpFill(lt, tpLevel as 1 | 2 | 3, fill.price, fill.qty, creds);
              const updatedEvents = [...(lt.events || []), tpResult.newEvent];
              await db.collection("live_trades").doc(lt.id!).update({
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
                });
              }
              await db.collection("live_trade_logs").add({
                timestamp: new Date().toISOString(),
                action: `TP${tpLevel}_HIT`,
                details: `${lt.signalSymbol} ${lt.side} TP${tpLevel} hit @ $${fill.price} PnL: $${tpResult.newEvent.pnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange,
              });
              Object.assign(lt, tpResult.updatedFields);
              lt.events = updatedEvents;
              result.fills++;
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
          const unrealizedPnl = (priceDiff / lt.entryPrice) * lt.positionSize * lt.leverage;

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
                  const slResult = await replaceSl(
                    connector, lt.symbol, lt.side, lt.slOrderId,
                    simTsl, lt.remainingQty, info, creds
                  );
                  if (slResult.newOrder.success) {
                    const newSlOrderId = slResult.newOrder.order!.orderId;
                    await db.collection("live_trades").doc(lt.id!).update({
                      trailingSl: simTsl,
                      slOrderId: newSlOrderId,
                    });
                    Object.assign(lt, { trailingSl: simTsl, slOrderId: newSlOrderId });
                    await db.collection("live_trade_logs").add({
                      timestamp: new Date().toISOString(),
                      action: "TRAILING_SL_SYNCED",
                      details: `${lt.signalSymbol} ${lt.side} SL updated ${lt.trailingSl ?? lt.stopLoss} → ${simTsl} (sim-driven)`,
                      symbol: lt.signalSymbol,
                      userId,
                      exchange,
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
            await db.collection("live_trades").doc(lt.id!).update({
              ...closeResult.updatedFields,
              events: [...(lt.events || []), closeResult.newEvent],
            });
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "ORPHANED_LIVE_CLOSE",
              details: `${lt.signalSymbol} ${lt.side} closed — no linked simulator trade found (simTradeId=${lt.simTradeId})${closeResult.warning ? ` — ${closeResult.warning}` : ""}`,
              symbol: lt.signalSymbol,
              userId,
              exchange,
            });
            lt.status = "CLOSED";
            result.simCloseSynced++;
          } else {
            result.errors.push(
              `${lt.signalSymbol}: orphaned close failed${closeResult.warning ? ` — ${closeResult.warning}` : ""} (will retry)`
            );
          }
          continue;
        }

        const sim = simDoc.data() as SimTrade;

        // Only mirror trailing-SL closes from the simulator.
        // Market-turn and pattern-break exits have been removed — let the
        // actual SL do its job rather than booking premature small losses.
        if (sim.status !== "CLOSED" || sim.closeReason !== "TRAILING_SL") continue;

        const closeReason = "TRAILING_SL" as const;
        const curPrice = getPrice(allPrices, lt.signalSymbol, exchange) ?? lt.entryPrice;
        const closeResult = await protectiveClose(lt, closeReason, curPrice, creds);

        if (closeResult.updatedFields.status === "CLOSED") {
          await db.collection("live_trades").doc(lt.id!).update({
            ...closeResult.updatedFields,
            events: [...(lt.events || []), closeResult.newEvent],
          });
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: `SIM_${closeReason}_CLOSE`,
            details: `${lt.signalSymbol} ${lt.side} closed (sim-driven: ${closeReason})${closeResult.warning ? ` — ${closeResult.warning}` : ""}`,
            symbol: lt.signalSymbol,
            userId,
            exchange,
          });
          lt.status = "CLOSED";
          result.simCloseSynced++;
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
        unrealizedPnl += priceDiff * t.remainingQty * t.leverage;
      }

      const totalDailyPnl = dailyRealizedPnl + unrealizedPnl;
      const capitalBase = liveTrades[0]?.capitalAtEntry ?? 1000;
      const dailyDrawdown = -totalDailyPnl / capitalBase;

      if (dailyDrawdown >= dailyLossLimit) {
        const stillOpen = liveTrades.filter((t) => t.status === "OPEN");
        for (const trade of stillOpen) {
          const curPrice = getPrice(allPrices, trade.signalSymbol, exchange) ?? trade.entryPrice;
          const closeResult = await protectiveClose(trade, "KILL_SWITCH", curPrice, creds);
          await db.collection("live_trades").doc(trade.id!).update({
            ...closeResult.updatedFields,
            events: [...(trade.events || []), closeResult.newEvent],
          });
          trade.status = "CLOSED";
          result.protectiveCloses++;
        }

        // Disable auto-trade for this exchange
        const killDocIds = getSecretDocIds(exchange);
        for (const killId of killDocIds) {
          const killRef = db.collection("users").doc(userId).collection("secrets").doc(killId);
          const killDoc = await killRef.get();
          if (killDoc.exists && docMatchesExchange(killDoc.data()!, exchange)) {
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
    let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), DHAN: new Map() };
    if (priceDoc.exists) {
      allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
    }

    // ── 2. Fetch signals and compute live scores ─────────────
    // We compute scores the same way the sim sync does so that
    // currentScore + currentScorePattern on live trades always
    // reflect the latest pattern evaluation, not stale Firestore fields.
    const signalsSnap = await db.collection("signals").get();
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
              const realizedPnl = (priceDiff / lt.entryPrice) * lt.positionSize * lt.leverage;
              const now = new Date().toISOString();

              await db.collection("live_trades").doc(lt.id!).update({
                status: "CLOSED",
                closeReason: "EOD_SQUARE_OFF",
                closedAt: now,
                exitPrice: closePrice,
                realizedPnl: Math.round(realizedPnl * 100) / 100,
              });

              await db.collection("live_trade_logs").add({
                timestamp: now,
                action: "EOD_SQUARE_OFF",
                details: `${lt.signalSymbol} ${lt.side} force-closed @ ₹${closePrice} for EOD square-off. PnL: ₹${realizedPnl.toFixed(2)}`,
                symbol: lt.signalSymbol,
                userId,
                exchange: "DHAN",
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

    // Query all users
    const usersSnap = await db.collection("users").get();

    const userChecks = usersSnap.docs.map(async (userDoc) => {
      const userId = userDoc.id;

      const exchangeChecks = ALL_EXCHANGES.map(async (exchangeName) => {
        if (STOCK_EXCHANGES.includes(exchangeName) && !isIndianMarketOpen()) return;
        const docIds = getSecretDocIds(exchangeName);

        for (const id of docIds) {
          try {
            const secretDoc = await db.collection("users").doc(userId)
              .collection("secrets").doc(id).get();

            if (secretDoc.exists) {
              const data = secretDoc.data()!;
              if (!docMatchesExchange(data, exchangeName)) continue;
              if (data.autoTradeEnabled === true) {
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

                  // Use cached token if still valid (5-min buffer)
                  if (data.encryptedCachedToken && data.cachedTokenExpiresAt) {
                    const expiresAt = new Date(data.cachedTokenExpiresAt as string).getTime();
                    if (Date.now() < expiresAt - 5 * 60 * 1000) {
                      try { accessToken = decrypt(data.encryptedCachedToken); } catch { /* stale */ }
                    }
                  }

                  // Regenerate token if cache is stale / expired
                  if (!accessToken && totpSecret && pin) {
                    const { token } = await generateTokenForUser(clientId, totpSecret, pin);
                    accessToken = token;
                    if (accessToken) {
                      const secretRef = db.collection("users").doc(userId).collection("secrets").doc(id);
                      await secretRef.update({
                        encryptedCachedToken: encrypt(accessToken),
                        cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      });
                    }
                  }

                  if (!accessToken) {
                    console.error(`[LiveSync] Could not obtain Dhan token for user ${userId} — skipping.`);
                    break;
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
                break;
              }
            }
          } catch {
            // skip this exchange for this user
          }
        }
      });

      await Promise.all(exchangeChecks);
    });

    await Promise.all(userChecks);

    if (pairs.length === 0) {
      return NextResponse.json({ success: true, message: "No active auto-trade users", pairs: 0 });
    }

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
        ).then((r) => ({ ...r, userId: pair.userId, exchange: pair.exchange }))
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
