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
import { detectMarketTurn, SIM_CONFIG, type MarketTurnInput } from "@/lib/simulator";
import { computeAutoFilter, mapFirestoreSignal } from "@/lib/auto-filter";
import { decrypt } from "@/lib/crypto";
import { sendMessage } from "@/lib/telegram";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  deserializePrices,
  getPrice,
  getSecretDocIds,
  docMatchesExchange,
  type AllExchangePrices,
} from "@/lib/exchanges";

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
  signalContext: { turnInputs: MarketTurnInput[]; scores: Map<string, any> },
  db: FirebaseFirestore.Firestore
): Promise<{
  fills: number;
  updates: number;
  protectiveCloses: number;
  errors: string[];
}> {
  const result = { fills: 0, updates: 0, protectiveCloses: 0, errors: [] as string[] };

  try {
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
        const fills = await checkOrderFills(lt, creds);

        for (const fill of fills.fills) {
          if (fill.type === "SL") {
            const slResult = await handleSlFill(lt, fill.price, fill.qty);
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

        if (lt.status === "CLOSED") continue;

        // ── 2. Update current price + unrealized PnL ─────────
        const livePrice = getPrice(allPrices, lt.signalSymbol, exchange);
        if (livePrice != null) {
          const isBuy = lt.side === "BUY";
          const priceDiff = isBuy ? livePrice - lt.entryPrice : lt.entryPrice - livePrice;
          const unrealizedPnl = (priceDiff / lt.entryPrice) * lt.positionSize * lt.leverage;

          await db.collection("live_trades").doc(lt.id!).update({
            currentPrice: livePrice,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
          });
          lt.currentPrice = livePrice;
          lt.unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
        }

        // ── 3. Trailing SL → breakeven ──────────────────────
        if (livePrice != null && lt.trailingSl == null) {
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
      } catch (ltErr) {
        const errMsg = ltErr instanceof Error ? ltErr.message : String(ltErr);
        console.error(`[LiveSync] Trade update failed for ${lt.signalSymbol} (${userId}/${exchange}):`, errMsg);
        result.errors.push(`${lt.signalSymbol}: ${errMsg}`);
      }
    }

    // ── 3. Protective closes: market turn ───────────────────
    const sidesTfsLive = new Set(
      liveTrades.filter((t) => t.status === "OPEN").map((t) => `${t.side}|${t.timeframe}`)
    );

    for (const key of sidesTfsLive) {
      const [side, tf] = key.split("|");
      const turn = detectMarketTurn(signalContext.turnInputs, side as "BUY" | "SELL", tf);

      if (turn.triggered) {
        const tradesToClose = liveTrades.filter(
          (t) => t.side === side && t.timeframe === tf && t.status === "OPEN",
        );
        for (const trade of tradesToClose) {
          const curPrice = getPrice(allPrices, trade.signalSymbol, exchange) ?? trade.entryPrice;
          const closeResult = await protectiveClose(trade, "MARKET_TURN", curPrice, creds);
          await db.collection("live_trades").doc(trade.id!).update({
            ...closeResult.updatedFields,
            events: [...(trade.events || []), closeResult.newEvent],
          });
          await db.collection("live_trade_logs").add({
            timestamp: new Date().toISOString(),
            action: "MARKET_TURN_CLOSE",
            details: `${trade.signalSymbol} ${trade.side} closed: ${turn.reason}${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
            symbol: trade.signalSymbol,
            userId,
            exchange,
          });
          trade.status = "CLOSED";
          result.protectiveCloses++;
        }
      }
    }

    // ── 4. Protective closes: score degradation ─────────────
    for (const trade of liveTrades) {
      if (trade.status === "CLOSED") continue;
      const signalScore = signalContext.scores.get(trade.signalId);
      const liveScore = signalScore?.score;

      if (liveScore != null && liveScore < SIM_CONFIG.SCORE_FLOOR) {
        const curPrice = getPrice(allPrices, trade.signalSymbol, exchange) ?? trade.entryPrice;
        const closeResult = await protectiveClose(trade, "SCORE_DEGRADED", curPrice, creds);
        await db.collection("live_trades").doc(trade.id!).update({
          ...closeResult.updatedFields,
          events: [...(trade.events || []), closeResult.newEvent],
        });
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "SCORE_DEGRADED_CLOSE",
          details: `${trade.signalSymbol} score=${liveScore} < ${SIM_CONFIG.SCORE_FLOOR} → closed${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
          symbol: trade.signalSymbol,
          userId,
          exchange,
        });
        trade.status = "CLOSED";
        result.protectiveCloses++;
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

    // ── 2. Build signal context for market turn/scoring ─────
    const signalsSnap = await db.collection("signals").get();
    const postUpdateDocs = signalsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
    const scores = computeAutoFilter(allSignalsForScoring);

    const turnInputs: MarketTurnInput[] = postUpdateDocs.map((d: any) => ({
      symbol: d.symbol || "",
      type: (d.type || "BUY") as "BUY" | "SELL",
      timeframe: String(d.timeframe || "15"),
      status: d.status || "",
      receivedAt: d.receivedAt || "",
      slHitAt: d.slHitAt ?? null,
      tp1Hit: d.tp1Hit === true,
      tp2Hit: d.tp2Hit === true,
      tp3Hit: d.tp3Hit === true,
      confidenceScore: d.confidenceScore ?? 0,
    }));

    const signalContext = { turnInputs, scores };

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

      const exchangeChecks = SUPPORTED_EXCHANGES.map(async (exchangeName) => {
        const docIds = getSecretDocIds(exchangeName);

        for (const id of docIds) {
          try {
            const secretDoc = await db.collection("users").doc(userId)
              .collection("secrets").doc(id).get();

            if (secretDoc.exists) {
              const data = secretDoc.data()!;
              if (!docMatchesExchange(data, exchangeName)) continue;
              if (data.autoTradeEnabled === true) {
                pairs.push({
                  userId,
                  exchange: exchangeName,
                  creds: {
                    apiKey: decrypt(data.encryptedKey),
                    apiSecret: decrypt(data.encryptedSecret),
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
          signalContext,
          db
        ).then((r) => ({ ...r, userId: pair.userId, exchange: pair.exchange }))
      )
    );

    // ── 5. Aggregate results ────────────────────────────────
    let totalFills = 0;
    let totalUpdates = 0;
    let totalProtective = 0;
    let totalErrors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalFills += r.value.fills;
        totalUpdates += r.value.updates;
        totalProtective += r.value.protectiveCloses;
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
      message: `LIVE SYNC: pairs=${pairs.length} fills=${totalFills} updates=${totalUpdates} protective=${totalProtective} errors=${totalErrors}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      pairs: pairs.length,
      fills: totalFills,
      updates: totalUpdates,
      protectiveCloses: totalProtective,
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
