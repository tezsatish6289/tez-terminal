import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  processTradeExit,
  checkDailyReset,
  computeUnrealizedPnl,
  computeTrailingSl,
  selectIncubatedSignals,
  openTrade,
  createInitialState,
  getSimStateDocId,
  detectMarketTurn,
  SIM_CONFIG,
  getEffectiveSimConfig,
  type SimulatorState,
  type SimTrade,
  type IncubatedCandidate,
  type MarketTurnInput,
} from "@/lib/simulator";
import {
  computeAutoFilter,
  mapFirestoreSignal,
  computeAlgoTfStats,
} from "@/lib/auto-filter";
import { deserializePrices, getReferencePrice, getPrice, type AllExchangePrices } from "@/lib/exchanges";
import { executeForAllUsers } from "@/lib/live-execution";
import { isMarketOpen } from "@/lib/market-hours";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * CRON 2: SIMULATOR TRADE MANAGEMENT
 *
 * Reads cached prices (from Cron 1) and manages simulator trades:
 * - TP/SL exits from signal events
 * - Trailing SL / price updates on open trades
 * - Market turn detection + score degradation closes
 * - Incubated signal selection + delayed entries
 *
 * Uses Binance prices for the simulator (consistent baseline).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // Load simulator param overrides (user-tunable via UI)
  let simConfig = SIM_CONFIG;
  try {
    const paramsDoc = await db.doc("config/simulator_params").get();
    if (paramsDoc.exists) {
      simConfig = getEffectiveSimConfig(paramsDoc.data() as any);
    }
  } catch {}

  try {
    // ── Read cached prices from Cron 1 ──────────────────────
    const priceDoc = await db.collection("config").doc("exchange_prices").get();
    let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), DHAN: new Map() };
    if (priceDoc.exists) {
      allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
    }

    const binancePriceCount = allPrices.BINANCE.size;
    const bybitPriceCount = allPrices.BYBIT.size;

    // Helper: get price for a sim trade using its originating exchange
    const getSimPrice = (symbol: string, exchange?: string): number | null =>
      getReferencePrice(allPrices, symbol, exchange);

    // ── Load signals for scoring context ────────────────────
    const signalsSnap = await db.collection("signals").get();
    const postUpdateDocs: { id: string; [key: string]: any }[] = [];
    for (const signalDoc of signalsSnap.docs) {
      postUpdateDocs.push({ id: signalDoc.id, ...signalDoc.data() });
    }

    // Compute scores for market turn / score degradation checks
    const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
    const scores = computeAutoFilter(allSignalsForScoring);

    // ── Helper: load/save sim state per asset type ─────────
    const simStates = new Map<string, SimulatorState>();
    async function loadSimState(assetType: string): Promise<SimulatorState> {
      const cached = simStates.get(assetType);
      if (cached) return cached;
      const docId = getSimStateDocId(assetType);
      const doc = await db.collection("config").doc(docId).get();
      const state = doc.exists
        ? checkDailyReset(doc.data() as SimulatorState)
        : createInitialState(assetType);
      simStates.set(assetType, state);
      return state;
    }
    function updateSimState(assetType: string, state: SimulatorState) {
      simStates.set(assetType, state);
    }
    async function flushSimStates() {
      for (const [assetType, state] of simStates.entries()) {
        await db.collection("config").doc(getSimStateDocId(assetType)).set(state);
      }
    }

    // ── Signal-event-driven exits ───────────────────────────
    let eventCloses = 0;
    try {
      const recentEventsSnap = await db.collection("signal_events")
        .where("createdAt", ">=", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .get();

      if (!recentEventsSnap.empty) {
        const tpSlEvents = recentEventsSnap.docs
          .map((d) => d.data())
          .filter((e) => ["TP1_HIT", "TP2_HIT", "TP3_HIT", "SL_HIT"].includes(e.type));

        for (const evt of tpSlEvents) {
          const simTradeSnap = await db.collection("simulator_trades")
            .where("signalId", "==", evt.signalId)
            .where("status", "==", "OPEN")
            .limit(1)
            .get();

          if (simTradeSnap.empty) continue;

          const simTradeDoc = simTradeSnap.docs[0];
          const simTrade = { id: simTradeDoc.id, ...simTradeDoc.data() } as SimTrade;
          const tradeAsset = simTrade.assetType ?? "CRYPTO";

          let simState = await loadSimState(tradeAsset);

          const exitType = evt.type.replace("_HIT", "") as "TP1" | "TP2" | "TP3" | "SL";
          const exitPrice = evt.price ?? simTrade.entryPrice;

          const result = processTradeExit({
            trade: simTrade,
            state: simState,
            exitType,
            exitPrice,
          });

          if (result) {
            const { id: _tid, ...tradeUpdate } = result.updatedTrade;
            await db.collection("simulator_trades").doc(simTradeDoc.id).update(tradeUpdate);
            updateSimState(tradeAsset, result.updatedState);
            await db.collection("simulator_logs").add(result.log);
            eventCloses++;
          }
        }

        await flushSimStates();
      }
    } catch (simErr: any) {
      console.error("[SimSync] Signal event trade closing failed:", simErr.message);
    }

    // ── Price updates + catch-up missed TP/SL on open trades ──
    let priceUpdates = 0;
    let trailingSlCloses = 0;
    try {
      const openSimSnap = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();

      if (!openSimSnap.empty) {
        for (const simDoc of openSimSnap.docs) {
          const t = simDoc.data() as SimTrade;
          const tradeAsset = t.assetType ?? "CRYPTO";
          if (!isMarketOpen(tradeAsset)) continue;
          const livePrice = getSimPrice(t.symbol, t.exchange);

          const signalDoc = await db.collection("signals").doc(t.signalId).get();
          const signal = signalDoc.exists ? signalDoc.data() : null;

          let simState2 = await loadSimState(tradeAsset);

          if (signal) {
            const missedExits: { type: "TP1" | "TP2" | "TP3" | "SL"; price: number }[] = [];
            if (signal.tp1Hit && !t.tp1Hit) missedExits.push({ type: "TP1", price: signal.tp1 ?? t.tp1 });
            if (signal.tp2Hit && !t.tp2Hit) missedExits.push({ type: "TP2", price: signal.tp2 ?? t.tp2 });
            if (signal.tp3Hit && !t.tp3Hit) missedExits.push({ type: "TP3", price: signal.tp3 ?? t.tp3 });
            if (signal.slHitAt && !t.slHit) missedExits.push({ type: "SL", price: signal.currentPrice ?? t.stopLoss });

            if (missedExits.length > 0) {
              let currentTrade: SimTrade = { ...t, id: simDoc.id };
              for (const exit of missedExits) {
                if (currentTrade.status === "CLOSED") break;
                const result = processTradeExit({
                  trade: currentTrade,
                  state: simState2,
                  exitType: exit.type,
                  exitPrice: exit.price,
                });
                if (result) {
                  currentTrade = result.updatedTrade;
                  simState2 = result.updatedState;
                  updateSimState(tradeAsset, simState2);
                  await db.collection("simulator_logs").add(result.log);
                }
              }
              const { id: _cid, ...catchUpUpdate } = currentTrade;
              await db.collection("simulator_trades").doc(simDoc.id).update(catchUpUpdate);
              continue;
            }
          }

          if (livePrice != null) {
            const isBuy = t.side === "BUY";
            const currentHwm = (t as any).highWatermark as number | null;
            const updatedHwm = currentHwm == null
              ? livePrice
              : isBuy
                ? Math.max(currentHwm, livePrice)
                : Math.min(currentHwm, livePrice);

            const tradeWithHwm = { ...t, highWatermark: updatedHwm };
            const newTrailingSl = computeTrailingSl(tradeWithHwm, livePrice);
            const effectiveSl = newTrailingSl ?? t.stopLoss;

            const trailingSlHit = isBuy
              ? livePrice <= effectiveSl && newTrailingSl != null
              : livePrice >= effectiveSl && newTrailingSl != null;

            if (trailingSlHit) {
              const exitResult = processTradeExit({
                trade: t,
                exitType: "SL",
                exitPrice: effectiveSl,
                state: simState2,
              });
              if (exitResult) {
                updateSimState(tradeAsset, exitResult.updatedState);
                const { id: _tslId, ...tslUpdate } = exitResult.updatedTrade;
                await db.collection("simulator_trades").doc(simDoc.id).update({
                  ...tslUpdate,
                  trailingSl: newTrailingSl,
                  highWatermark: updatedHwm,
                  closeReason: "TRAILING_SL",
                });
                await db.collection("simulator_logs").add(exitResult.log);
                trailingSlCloses++;
              }
            } else {
              const unrealizedPnl = computeUnrealizedPnl(t, livePrice);
              const liveScore = scores.get(t.signalId)?.score ?? null;
              const updatePayload: Record<string, unknown> = {
                currentPrice: livePrice,
                unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
                highWatermark: updatedHwm,
                currentScore: liveScore,
              };
              if (newTrailingSl !== t.trailingSl && newTrailingSl != null && t.trailingSl == null) {
                updatePayload.trailingSl = newTrailingSl;
                const slToBeEvent = {
                  type: "SL_TO_BE",
                  price: livePrice,
                  pnl: 0,
                  fee: 0,
                  closePct: 0,
                  timestamp: new Date().toISOString(),
                };
                updatePayload.events = [...(t.events || []), slToBeEvent];
              } else if (newTrailingSl !== t.trailingSl) {
                updatePayload.trailingSl = newTrailingSl;
              }
              await db.collection("simulator_trades").doc(simDoc.id).update(updatePayload);
              priceUpdates++;
            }
          }
        }

        await flushSimStates();
      }
    } catch (priceErr: any) {
      console.error("[SimSync] Price update failed:", priceErr.message);
    }

    // ── Market turn + score degradation ─────────────────────
    let marketTurnCloses = 0;
    let scoreDegradedCloses = 0;
    try {
      const openSimSnapMT = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();

      if (!openSimSnapMT.empty) {
        const openSimTradesMT = openSimSnapMT.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

        const turnInputs: MarketTurnInput[] = postUpdateDocs.map((d) => ({
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

        const sidesTfs = new Set(openSimTradesMT.map((t) => `${t.side}|${t.timeframe}`));

        for (const key of sidesTfs) {
          const [side, tf] = key.split("|");
          const turn = detectMarketTurn(turnInputs, side as "BUY" | "SELL", tf);

          if (turn.triggered) {
            const tradesToClose = openSimTradesMT.filter(
              (t) => t.side === side && t.timeframe === tf && t.status === "OPEN",
            );

            for (const trade of tradesToClose) {
              const tradeAsset = trade.assetType ?? "CRYPTO";
              let simStateMT = await loadSimState(tradeAsset);
              const livePrice = trade.currentPrice ?? trade.entryPrice;
              const exitResult = processTradeExit({
                trade,
                exitType: "SL",
                exitPrice: livePrice,
                state: simStateMT,
              });
              if (exitResult) {
                updateSimState(tradeAsset, exitResult.updatedState);
                const { id: _mtId, ...mtUpdate } = exitResult.updatedTrade;
                await db.collection("simulator_trades").doc(trade.id!).update({
                  ...mtUpdate,
                  closeReason: "MARKET_TURN",
                });
                await db.collection("simulator_logs").add({
                  ...exitResult.log,
                  action: "MARKET_TURN",
                  details: `${turn.reason} → closed ${trade.symbol} ${trade.side} at ${tradeAsset === "INDIAN_STOCKS" ? "₹" : "$"}${livePrice}`,
                  assetType: tradeAsset,
                });
                trade.status = "CLOSED";
                marketTurnCloses++;
              }
            }
          }
        }

        for (const trade of openSimTradesMT) {
          if (trade.status === "CLOSED") continue;
          const signalScore = scores.get(trade.signalId);
          const liveScore = signalScore?.score;

          if (liveScore != null && liveScore < SIM_CONFIG.SCORE_FLOOR) {
            const tradeAsset = trade.assetType ?? "CRYPTO";
            let simStateMT = await loadSimState(tradeAsset);
            const livePrice = trade.currentPrice ?? trade.entryPrice;
            const exitResult = processTradeExit({
              trade,
              exitType: "SL",
              exitPrice: livePrice,
              state: simStateMT,
            });
            if (exitResult) {
              updateSimState(tradeAsset, exitResult.updatedState);
              const { id: _sdId, ...sdUpdate } = exitResult.updatedTrade;
              await db.collection("simulator_trades").doc(trade.id!).update({
                ...sdUpdate,
                closeReason: "SCORE_DEGRADED",
              });
              await db.collection("simulator_logs").add({
                ...exitResult.log,
                action: "SCORE_DEGRADED",
                details: `${trade.symbol} score dropped to ${liveScore} (floor: ${SIM_CONFIG.SCORE_FLOOR}) → closed at ${tradeAsset === "INDIAN_STOCKS" ? "₹" : "$"}${livePrice}`,
                assetType: tradeAsset,
              });
              trade.status = "CLOSED";
              scoreDegradedCloses++;
            }
          }
        }

        if (marketTurnCloses > 0 || scoreDegradedCloses > 0) {
          await flushSimStates();
        }
      }
    } catch (mtErr: any) {
      console.error("[SimSync] Market turn / score degradation failed:", mtErr.message);
    }

    // ── Incubated signal selection (per asset type) ────────
    let incubatedCount = 0;
    try {
      const biasDoc = await db.collection("config").doc("market_bias").get();
      const bullScore = biasDoc.exists ? (biasDoc.data()?.bullScore ?? 0) : 0;
      const bearScore = biasDoc.exists ? (biasDoc.data()?.bearScore ?? 0) : 0;

      const openSimSnap2 = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();
      const openSimTrades = openSimSnap2.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

      const candidates: IncubatedCandidate[] = postUpdateDocs
        .filter((d) =>
          d.status === "ACTIVE" &&
          d.currentPrice != null &&
          d.price != null &&
          d.stopLoss != null,
        )
        .map((d) => ({
          id: d.id,
          symbol: d.symbol || "",
          exchange: d.exchange ?? "BINANCE",
          assetType: d.assetType ?? "CRYPTO",
          type: (d.type || "BUY") as "BUY" | "SELL",
          timeframe: String(d.timeframe || "15"),
          algo: d.algo || "",
          entryPrice: Number(d.price),
          currentPrice: Number(d.currentPrice),
          stopLoss: Number(d.stopLoss),
          tp1: Number(d.tp1 || 0),
          tp2: Number(d.tp2 || 0),
          tp3: Number(d.tp3 || 0),
          confidenceScore: d.confidenceScore ?? (scores.get(d.id)?.score ?? 0),
          tp1Hit: d.tp1Hit === true,
          slHitAt: d.slHitAt ?? null,
        }));

      const regimeDoc = await db.collection("config").doc("market_regime").get();
      const regimeData = regimeDoc.exists ? regimeDoc.data() : {};
      const liveWinRates = new Map<string, { winRate: number | null; sampleSize: number }>();
      if (regimeData) {
        for (const [key, val] of Object.entries(regimeData)) {
          if (key === "lastUpdated") continue;
          const v = val as any;
          liveWinRates.set(key, { winRate: v.winRate ?? null, sampleSize: v.sampleSize ?? 0 });
        }
      }

      const allSignalsForAlgo = postUpdateDocs.map(mapFirestoreSignal);
      const algoTfStats = computeAlgoTfStats(allSignalsForAlgo);
      const algoStatsMap = new Map<string, { winRate: number | null; sampleSize: number }>();
      for (const [key, val] of algoTfStats.entries()) {
        algoStatsMap.set(key, { winRate: val.winRate, sampleSize: val.sampleSize });
      }

      // Group candidates by asset type for separate simulator pools
      const assetTypes = [...new Set(candidates.map((c) => c.assetType))];
      if (assetTypes.length === 0) assetTypes.push("CRYPTO");

      for (const assetType of assetTypes) {
        if (!isMarketOpen(assetType)) continue;
        const assetCandidates = candidates.filter((c) => c.assetType === assetType);
        const assetOpenTrades = openSimTrades.filter((t) => (t.assetType ?? "CRYPTO") === assetType);
        let simState3 = await loadSimState(assetType);

        const { selected, skipped: incubSkipped } = selectIncubatedSignals({
          candidates: assetCandidates,
          state: simState3,
          bullScore,
          bearScore,
          openTrades: assetOpenTrades,
          liveWinRates,
          algoStats: algoStatsMap,
          simConfig,
        });

        for (const c of selected) {
          const isBuy = c.type === "BUY";
          const slDistancePct = isBuy
            ? (c.currentPrice - c.stopLoss) / c.currentPrice
            : (c.stopLoss - c.currentPrice) / c.currentPrice;

          if (slDistancePct <= 0) continue;

          const leverage = (await import("@/lib/leverage")).getLeverage(c.timeframe, assetType);
          const hasStreak = (simState3.consecutiveWins ?? 0) >= SIM_CONFIG.STREAK_WINS_TO_SCALE;
          const riskPct = hasStreak ? SIM_CONFIG.RISK_PER_TRADE_STREAK : SIM_CONFIG.RISK_PER_TRADE_BASE;
          const riskAmount = simState3.capital * riskPct;
          let positionSize = riskAmount / (slDistancePct * leverage);
          if (positionSize > simState3.capital * 0.05 || positionSize < 1) continue;
          positionSize = Math.round(positionSize * 100) / 100;

          const regimeKey = `${c.timeframe}_${c.type}`;
          const liveEntry = liveWinRates.get(regimeKey);
          const algoKey = `${c.algo}|${c.timeframe}`;
          const algoEntry = algoStatsMap.get(algoKey);

          const result = openTrade({
            signal: {
              id: c.id,
              symbol: c.symbol,
              exchange: c.exchange,
              assetType: c.assetType,
              type: c.type,
              timeframe: c.timeframe,
              algo: c.algo,
              price: c.currentPrice,
              stopLoss: c.stopLoss,
              tp1: c.tp1,
              tp2: c.tp2,
              tp3: c.tp3,
              confidenceScore: c.confidenceScore,
            },
            positionSize,
            state: simState3,
            bullScore,
            bearScore,
            liveWinRate: liveEntry?.winRate ?? 0,
            algoWinRate: algoEntry?.winRate ?? 0,
          });

          const simTradeRef = await db.collection("simulator_trades").add(result.trade);
          simState3 = result.updatedState;
          updateSimState(assetType, simState3);
          result.log.details = `[INCUBATED] ${result.log.details}`;
          await db.collection("simulator_logs").add(result.log);
          incubatedCount++;

          try {
            const signalData = postUpdateDocs.find((d) => d.id === c.id);
            const signalExchange = signalData?.exchange ?? "BINANCE";
            await executeForAllUsers(
              db, result.trade, simTradeRef.id, simState3.capital,
              c.id, c.symbol, c.type, signalExchange, simConfig,
            );
          } catch (liveErr) {
            const errMsg = liveErr instanceof Error ? liveErr.message : String(liveErr);
            console.error("[SimSync] Incubated live execution failed:", errMsg);
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "ERROR",
              details: `[INCUBATED] Live execution crashed for ${c.symbol} ${c.type}: ${errMsg}`,
              signalId: c.id,
              symbol: c.symbol,
            }).catch(() => {});
          }
        }

        for (const skip of incubSkipped.slice(0, 5)) {
          await db.collection("simulator_logs").add({
            timestamp: new Date().toISOString(),
            action: "INCUBATED_SKIPPED",
            details: `${skip.symbol}: ${skip.reason}`,
            capital: simState3.capital,
            assetType,
          });
        }
      }

      await flushSimStates();
    } catch (incErr: any) {
      console.error("[SimSync] Incubated signal selection failed:", incErr.message);
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `SIM SYNC: eventCloses=${eventCloses} priceUpdates=${priceUpdates} trailingSl=${trailingSlCloses} mktTurn=${marketTurnCloses} scoreDeg=${scoreDegradedCloses} incubated=${incubatedCount}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      prices: { binance: binancePriceCount, bybit: bybitPriceCount },
      eventCloses,
      priceUpdates,
      trailingSlCloses,
      marketTurnCloses,
      scoreDegradedCloses,
      incubatedCount,
    });
  } catch (error: any) {
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Simulator Sync Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
