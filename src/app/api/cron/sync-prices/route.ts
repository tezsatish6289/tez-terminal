import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { rawPnlPercent, calcBookedPnl, deriveTp3, areTpsValid, areTpDistancesSane } from "@/lib/pnl";
import type { SignalEvent } from "@/lib/telegram";
import {
  computeAutoFilter,
  mapFirestoreSignal,
  isSignalStale,
  AUTO_FILTER_THRESHOLD,
  isRegimeStale,
  computeMarketRegime,
  computeAlgoTfStats,
  type MarketRegimeData,
} from "@/lib/auto-filter";
import {
  processTradeExit,
  checkDailyReset,
  computeUnrealizedPnl,
  computeTrailingSl,
  selectIncubatedSignals,
  openTrade,
  createInitialState,
  detectMarketTurn,
  SIM_CONFIG,
  type SimulatorState,
  type SimTrade,
  type IncubatedCandidate,
  type MarketTurnInput,
} from "@/lib/simulator";
import {
  checkOrderFills,
  handleTpFill,
  handleSlFill,
  moveSlToBreakeven,
  protectiveClose,
  type LiveTrade,
  type Credentials,
} from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";
import { sendMessage } from "@/lib/telegram";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 24/7 PERFORMANCE SYNC ENGINE - ASIA OPTIMIZED
 * This engine runs from Singapore (asia-southeast1) to bypass US-region blocks.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  const spotPriceMap: Record<string, number> = {};
  const perpetualsPriceMap: Record<string, number> = {};
  const fetchOptions = { cache: 'no-store' as RequestCache, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } };

  const fillPriceMap = (data: any[], map: Record<string, number>) => {
    if (!Array.isArray(data)) return;
    data.forEach((p: any) => {
      if (p.symbol && p.price) map[p.symbol.toUpperCase()] = parseFloat(p.price);
    });
  };

  try {
    const spotUrl = "https://api.binance.com/api/v3/ticker/price";
    const perpetualsUrl = "https://fapi.binance.com/fapi/v2/ticker/price";

    const spotRes = await fetch(spotUrl, fetchOptions);
    if (spotRes.ok) fillPriceMap(await spotRes.json(), spotPriceMap);

    const perpetualsRes = await fetch(perpetualsUrl, fetchOptions);
    if (perpetualsRes.ok) fillPriceMap(await perpetualsRes.json(), perpetualsPriceMap);

    const signalsSnap = await db.collection("signals").get();
    let updateCount = 0;
    let skipCount = 0;
    const signalEvents: SignalEvent[] = [];
    const postUpdateDocs: { id: string; [key: string]: any }[] = [];

    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;

      // Deprecated signals are dead — skip entirely
      if (signal.autoFilterPassed === false) continue;

      const rawSymbol = (signal.symbol || "").split(':').pop() || "";
      const isPerpetual = /\.P$|\.PERP$/i.test(rawSymbol);
      const symbol = rawSymbol.replace(/\.P$|\.PERP$/i, '').toUpperCase();

      const priceMap = isPerpetual ? perpetualsPriceMap : spotPriceMap;
      const currentPrice = priceMap[symbol] ?? priceMap[symbol + "USDT"];

      if (!currentPrice) {
        skipCount++;
        await db.collection("logs").add({
          timestamp: new Date().toISOString(),
          level: "WARN",
          message: "Symbol not in Binance feed",
          details: `signalId=${signalDoc.id} symbol=${rawSymbol} normalized=${symbol} feed=${isPerpetual ? "perpetuals" : "spot"}`,
          webhookId: "SYSTEM_CRON",
        });
        continue;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);

      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      if (signal.type === 'BUY') {
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown || newMaxDrawdown === 0) newMaxDrawdown = currentPrice;
      } else {
        if (currentPrice < newMaxUpside || newMaxUpside === 0) newMaxUpside = currentPrice;
        if (currentPrice > newMaxDrawdown) newMaxDrawdown = currentPrice;
      }

      const updateData: Record<string, any> = {
        currentPrice: currentPrice,
        maxUpsidePrice: newMaxUpside,
        maxDrawdownPrice: newMaxDrawdown,
        lastSyncAt: new Date().toISOString()
      };

      // Only process TP/SL checks for AI-passed signals
      const aiApproved = signal.autoFilterPassed === true;

      const tp1 = signal.tp1 != null ? Number(signal.tp1) : null;
      const tp2 = signal.tp2 != null ? Number(signal.tp2) : null;
      const tp3 = signal.tp3 != null ? Number(signal.tp3) : (tp1 != null && tp2 != null ? deriveTp3(tp1, tp2) : null);
      const isBuy = signal.type === "BUY";
      const nowISO = new Date().toISOString();
      let newStatus = "ACTIVE";

      const tpsValid = tp1 != null && tp2 != null ? areTpsValid(signal.type, alertPrice, tp1, tp2) : true;
      const tpDistanceSane = tp1 != null ? areTpDistancesSane(alertPrice, tp1, signal.timeframe ?? "15") : true;

      if ((!tpsValid || !tpDistanceSane) && signal.status === "ACTIVE") {
        await db.collection("logs").add({
          timestamp: nowISO, level: "ERROR",
          message: !tpsValid ? "TP direction mismatch — skipping TP/SL processing" : "TP distance irrational — skipping TP/SL processing",
          details: `signalId=${signalDoc.id} symbol=${signal.symbol} type=${signal.type} entry=${alertPrice} tp1=${tp1} tp2=${tp2} tf=${signal.timeframe} tp1Dist=${tp1 ? (Math.abs(tp1 - alertPrice) / alertPrice * 100).toFixed(2) : 'N/A'}%`,
          webhookId: "SYSTEM_CRON",
        });
      }

      if (aiApproved && tpsValid && tpDistanceSane && tp1 != null && tp2 != null && tp3 != null) {
        const tp1AlreadyHit = signal.tp1Hit === true;
        const tp2AlreadyHit = signal.tp2Hit === true;
        const tp3AlreadyHit = signal.tp3Hit === true;

        if (!tp1AlreadyHit) {
          const hitTp1 = isBuy ? currentPrice >= tp1 : currentPrice <= tp1;
          if (hitTp1) {
            updateData.tp1Hit = true;
            updateData.tp1HitAt = nowISO;
            updateData.tp1BookedPnl = calcBookedPnl(tp1, alertPrice, signal.type, 0.5);
            updateData.stopLoss = alertPrice;
            updateData.originalStopLoss = stopLoss;
            signalEvents.push({
              type: "TP1_HIT", signalId: signalDoc.id, symbol: signal.symbol,
              side: signal.type, timeframe: signal.timeframe || "15", assetType: signal.assetType || "CRYPTO",
              entryPrice: alertPrice, price: tp1, tp1, tp2, tp3,
              bookedPnl: updateData.tp1BookedPnl,
              totalBookedPnl: updateData.tp1BookedPnl,
              guidance: "Book 50% profit. Move SL to cost.",
            });
          }
        }

        const tp1IsHit = tp1AlreadyHit || updateData.tp1Hit === true;

        if (tp1IsHit && !tp2AlreadyHit) {
          const hitTp2 = isBuy ? currentPrice >= tp2 : currentPrice <= tp2;
          if (hitTp2) {
            updateData.tp2Hit = true;
            updateData.tp2HitAt = nowISO;
            updateData.tp2BookedPnl = calcBookedPnl(tp2, alertPrice, signal.type, 0.25);
            updateData.stopLoss = tp1;
            const tp2CumulativePnl = (signal.tp1BookedPnl ?? updateData.tp1BookedPnl ?? 0) + updateData.tp2BookedPnl;
            signalEvents.push({
              type: "TP2_HIT", signalId: signalDoc.id, symbol: signal.symbol,
              side: signal.type, timeframe: signal.timeframe || "15", assetType: signal.assetType || "CRYPTO",
              entryPrice: alertPrice, price: tp2, tp1, tp2, tp3,
              bookedPnl: updateData.tp2BookedPnl,
              totalBookedPnl: tp2CumulativePnl,
              guidance: "Book 25% more. Move SL to TP1.",
            });
          }
        }

        const tp2IsHit = tp2AlreadyHit || updateData.tp2Hit === true;

        if (tp2IsHit && !tp3AlreadyHit) {
          const hitTp3 = isBuy ? currentPrice >= tp3 : currentPrice <= tp3;
          if (hitTp3) {
            const tp1Pnl = signal.tp1BookedPnl ?? updateData.tp1BookedPnl ?? 0;
            const tp2Pnl = signal.tp2BookedPnl ?? updateData.tp2BookedPnl ?? 0;
            updateData.tp3Hit = true;
            updateData.tp3HitAt = nowISO;
            updateData.tp3BookedPnl = calcBookedPnl(tp3, alertPrice, signal.type, 0.25);
            updateData.totalBookedPnl = tp1Pnl + tp2Pnl + updateData.tp3BookedPnl;
            newStatus = "INACTIVE";
            signalEvents.push({
              type: "TP3_HIT", signalId: signalDoc.id, symbol: signal.symbol,
              side: signal.type, timeframe: signal.timeframe || "15", assetType: signal.assetType || "CRYPTO",
              entryPrice: alertPrice, price: tp3, tp1, tp2, tp3,
              totalBookedPnl: updateData.totalBookedPnl, guidance: "All targets hit. Book full profit.",
            });
          }
        }

        if (newStatus === "ACTIVE") {
          let effectiveSL: number;
          if (tp2IsHit) {
            effectiveSL = tp1;
          } else if (tp1IsHit) {
            effectiveSL = alertPrice;
          } else {
            effectiveSL = stopLoss;
          }

          if (effectiveSL > 0) {
            const hitSL = isBuy ? currentPrice <= effectiveSL : currentPrice >= effectiveSL;
            if (hitSL) {
              const tp1Pnl = signal.tp1BookedPnl ?? updateData.tp1BookedPnl ?? 0;
              const tp2Pnl = signal.tp2BookedPnl ?? updateData.tp2BookedPnl ?? 0;
              updateData.slHitAt = nowISO;

              if (tp2IsHit) {
                updateData.slBookedPnl = calcBookedPnl(tp1, alertPrice, signal.type, 0.25);
                updateData.totalBookedPnl = tp1Pnl + tp2Pnl + updateData.slBookedPnl;
              } else if (tp1IsHit) {
                updateData.slBookedPnl = 0;
                updateData.totalBookedPnl = tp1Pnl;
              } else {
                const slLoss = rawPnlPercent(effectiveSL, alertPrice, signal.type);
                updateData.slBookedPnl = slLoss;
                updateData.totalBookedPnl = slLoss;
              }
              newStatus = "INACTIVE";
              const slGuidance = (tp1IsHit || tp2IsHit)
                ? "Trailing SL hit. Close trade in profit."
                : "Stop loss hit. Close trade and protect capital.";
              signalEvents.push({
                type: "SL_HIT", signalId: signalDoc.id, symbol: signal.symbol,
                side: signal.type, timeframe: signal.timeframe || "15", assetType: signal.assetType || "CRYPTO",
                entryPrice: alertPrice, price: currentPrice, tp1, tp2, tp3,
                totalBookedPnl: updateData.totalBookedPnl, guidance: slGuidance,
              });
            }
          }
        }
      } else if (aiApproved) {
        if (stopLoss > 0) {
          const hitSL = isBuy ? currentPrice <= stopLoss : currentPrice >= stopLoss;
          if (hitSL) {
            updateData.slHitAt = nowISO;
            updateData.slBookedPnl = rawPnlPercent(stopLoss, alertPrice, signal.type);
            updateData.totalBookedPnl = updateData.slBookedPnl;
            newStatus = "INACTIVE";
            signalEvents.push({
              type: "SL_HIT", signalId: signalDoc.id, symbol: signal.symbol,
              side: signal.type, timeframe: signal.timeframe || "15", assetType: signal.assetType || "CRYPTO",
              entryPrice: alertPrice, price: currentPrice, stopLoss,
              totalBookedPnl: updateData.totalBookedPnl, guidance: "Stop loss hit. Close trade and protect capital.",
            });
          }
        }
      }

      if (tp1 != null && tp2 != null && signal.tp3 == null) {
        updateData.tp3 = deriveTp3(tp1, tp2);
        updateData.tp3Hit = false;
        updateData.tp3HitAt = null;
        updateData.tp3BookedPnl = null;
      }

      updateData.status = newStatus;

      await db.collection("signals").doc(signalDoc.id).update(updateData);
      postUpdateDocs.push({ id: signalDoc.id, ...signal, ...updateData });
      updateCount++;
    }

    // Also include non-active signals for historical algo stats
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status === "ACTIVE") continue;
      postUpdateDocs.push({ id: signalDoc.id, ...signal });
    }

    for (const evt of signalEvents) {
      await db.collection("signal_events").add({
        ...evt,
        createdAt: new Date().toISOString(),
        notified: false,
        notifiedAt: null,
      });
    }

    // ── Simulator: process TP/SL hits on open sim trades ──
    if (signalEvents.length > 0) {
      try {
        const simStateDoc = await db.collection("config").doc("simulator_state").get();
        if (simStateDoc.exists) {
          let simState = checkDailyReset(simStateDoc.data() as SimulatorState);

          const tpSlEvents = signalEvents.filter(
            (e) => e.type === "TP1_HIT" || e.type === "TP2_HIT" || e.type === "TP3_HIT" || e.type === "SL_HIT",
          );

          for (const evt of tpSlEvents) {
            const simTradeSnap = await db.collection("simulator_trades")
              .where("signalId", "==", evt.signalId)
              .where("status", "==", "OPEN")
              .limit(1)
              .get();

            if (simTradeSnap.empty) continue;

            const simTradeDoc = simTradeSnap.docs[0];
            const simTrade = { id: simTradeDoc.id, ...simTradeDoc.data() } as SimTrade;

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
              simState = result.updatedState;
              await db.collection("simulator_logs").add(result.log);
            }
          }

          await db.collection("config").doc("simulator_state").set(simState);
        }
      } catch (simErr: any) {
        console.error("[Sync] Simulator trade closing failed:", simErr.message);
      }
    }

    // ── Simulator: update live prices + catch-up missed TP/SL on open trades ──
    try {
      const openSimSnap = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();

      if (!openSimSnap.empty) {
        const simStateDoc2 = await db.collection("config").doc("simulator_state").get();
        let simState2 = simStateDoc2.exists
          ? checkDailyReset(simStateDoc2.data() as SimulatorState)
          : null;

        for (const simDoc of openSimSnap.docs) {
          const t = simDoc.data() as SimTrade;
          const rawSym = t.symbol.replace(/\.P$|\.PERP$/i, "").toUpperCase();
          const livePrice = perpetualsPriceMap[rawSym] ?? perpetualsPriceMap[rawSym + "USDT"]
            ?? spotPriceMap[rawSym] ?? spotPriceMap[rawSym + "USDT"];

          // Check if the underlying signal has already closed (SL/TP hit)
          const signalDoc = await db.collection("signals").doc(t.signalId).get();
          const signal = signalDoc.exists ? signalDoc.data() : null;

          if (signal && simState2) {
            // Process missed exits in order: TP1 → TP2 → TP3 → SL
            // so partial profits are booked before an SL closes the remainder
            const missedExits: { type: "TP1" | "TP2" | "TP3" | "SL"; price: number }[] = [];
            if (signal.tp1Hit && !t.tp1Hit) {
              missedExits.push({ type: "TP1", price: signal.tp1 ?? t.tp1 });
            }
            if (signal.tp2Hit && !t.tp2Hit) {
              missedExits.push({ type: "TP2", price: signal.tp2 ?? t.tp2 });
            }
            if (signal.tp3Hit && !t.tp3Hit) {
              missedExits.push({ type: "TP3", price: signal.tp3 ?? t.tp3 });
            }
            if (signal.slHitAt && !t.slHit) {
              missedExits.push({ type: "SL", price: signal.currentPrice ?? t.stopLoss });
            }

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
                  await db.collection("simulator_logs").add(result.log);
                }
              }
              const { id: _cid, ...catchUpUpdate } = currentTrade;
              await db.collection("simulator_trades").doc(simDoc.id).update(catchUpUpdate);
              continue;
            }
          }

          if (livePrice != null) {
            // Trailing SL: move to breakeven once price crosses 50% of TP1 distance
            const newTrailingSl = computeTrailingSl(t, livePrice);
            const effectiveSl = newTrailingSl ?? t.stopLoss;
            const isBuy = t.side === "BUY";

            // Check if trailing SL was hit
            const trailingSlHit = isBuy
              ? livePrice <= effectiveSl && newTrailingSl != null
              : livePrice >= effectiveSl && newTrailingSl != null;

            if (trailingSlHit && simState2) {
              const exitResult = processTradeExit({
                trade: t,
                exitType: "SL",
                exitPrice: effectiveSl,
                state: simState2,
              });
              if (exitResult) {
                simState2 = exitResult.updatedState;
                const { id: _tslId, ...tslUpdate } = exitResult.updatedTrade;
                await db.collection("simulator_trades").doc(simDoc.id).update({
                  ...tslUpdate,
                  trailingSl: newTrailingSl,
                  closeReason: "TRAILING_SL",
                });
                await db.collection("simulator_logs").add(exitResult.log);
              }
            } else {
              const unrealizedPnl = computeUnrealizedPnl(t, livePrice);
              const updatePayload: Record<string, unknown> = {
                currentPrice: livePrice,
                unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
              };
              if (newTrailingSl !== t.trailingSl && newTrailingSl != null && t.trailingSl == null) {
                updatePayload.trailingSl = newTrailingSl;
                // Record the SL→BE event in the trade timeline
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
            }
          }
        }

        if (simState2) {
          await db.collection("config").doc("simulator_state").set(simState2);
        }
      }
    } catch (priceErr: any) {
      console.error("[Sync] Simulator price update failed:", priceErr.message);
    }

    // ── AI Filter Rescoring Pass ──────────────────────────
    let scoreCount = 0;
    let previousRegime: MarketRegimeData | undefined;
    let baseThreshold = AUTO_FILTER_THRESHOLD;
    let scores = new Map<string, { signalId: string; score: number; label: string; color: string; breakdown: any }>();
    try {
      // Read configurable base threshold
      try {
        const filterCfg = await db.collection("config").doc("auto_filter").get();
        if (filterCfg.exists) {
          const val = filterCfg.data()?.baseThreshold;
          if (typeof val === "number" && val > 0) baseThreshold = val;
        }
      } catch {}

      // Read existing regime for dynamic thresholds + history
      let regimeData: Record<string, any> = {};
      try {
        const regimeDoc = await db.collection("config").doc("market_regime").get();
        if (regimeDoc.exists) {
          const raw = regimeDoc.data() || {};
          previousRegime = raw as MarketRegimeData;
          regimeData = raw;
        }
      } catch {}

      const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
      scores = computeAutoFilter(allSignalsForScoring);

      for (const signalDoc of signalsSnap.docs) {
        const signal = signalDoc.data();
        if (signal.status !== "ACTIVE") continue;
        if (signal.tp1Hit || signal.tp2Hit || signal.tp3Hit || signal.slHitAt) continue;

        const scoreResult = scores.get(signalDoc.id);
        const scoreData: Record<string, any> = {
          lastScoredAt: new Date().toISOString(),
        };

        const regimeKey = `${signal.timeframe || "15"}_${signal.type || "BUY"}`;
        const regimeEntry = regimeData[regimeKey];
        const threshold = (regimeEntry?.adjustedThreshold && !isRegimeStale(regimeEntry.lastUpdated, signal.timeframe || "15"))
          ? regimeEntry.adjustedThreshold
          : baseThreshold;

        if (signal.autoFilterPassed === null || signal.autoFilterPassed === undefined) {
          // First-time scoring (webhook after() must have failed)
          if (isSignalStale(signal.receivedAt, signal.timeframe || "15")) {
            scoreData.autoFilterPassed = false;
            scoreData.confidenceScore = 0;
            scoreData.confidenceLabel = "Stale";
            scoreData.scoredAtThreshold = threshold;
          } else if (scoreResult) {
            scoreData.autoFilterPassed = scoreResult.score >= threshold;
            scoreData.confidenceScore = scoreResult.score;
            scoreData.confidenceLabel = scoreResult.label;
            scoreData.scoreBreakdown = scoreResult.breakdown;
            scoreData.scoredAtThreshold = threshold;
            scoreData.initialConfidenceScore = scoreResult.score;
            scoreData.maxConfidenceScore = scoreResult.score;
            scoreData.minConfidenceScore = scoreResult.score;
          }
        } else if (signal.autoFilterPassed === true && scoreResult) {
          scoreData.confidenceScore = scoreResult.score;
          scoreData.confidenceLabel = scoreResult.label;
          scoreData.scoreBreakdown = scoreResult.breakdown;
          scoreData.scoredAtThreshold = threshold;
          const existingMax = signal.maxConfidenceScore ?? scoreResult.score;
          const existingMin = signal.minConfidenceScore ?? scoreResult.score;
          scoreData.maxConfidenceScore = Math.max(existingMax, scoreResult.score);
          scoreData.minConfidenceScore = Math.min(existingMin, scoreResult.score);
        }
        // autoFilterPassed === false → deprecated, skip

        if (Object.keys(scoreData).length > 1) {
          await db.collection("signals").doc(signalDoc.id).update(scoreData);
          scoreCount++;
        }
      }
    } catch (scoreErr: any) {
      console.error("[Sync] AI rescoring failed:", scoreErr.message);
    }

    // ── Market Bias Aggregation (Phase 1.5) ─────────────
    try {
      const TF_WEIGHTS: Record<string, number> = { "5": 1, "15": 2, "60": 3, "240": 4 };
      const biasData: Record<string, number> = {};

      for (const side of ["BUY", "SELL"] as const) {
        let weightedSum = 0;
        let totalWeight = 0;

        for (const [tf, weight] of Object.entries(TF_WEIGHTS)) {
          const tfSignals = postUpdateDocs.filter(
            (d) =>
              d.autoFilterPassed === true &&
              d.status === "ACTIVE" &&
              !d.tp1Hit && !d.tp2Hit && !d.tp3Hit && !d.slHitAt &&
              String(d.timeframe) === tf &&
              d.type === side,
          );

          if (tfSignals.length === 0) continue;

          const tfScores = tfSignals
            .map((d) => scores.get(d.id)?.score ?? d.confidenceScore)
            .filter((s): s is number => s != null);

          if (tfScores.length === 0) continue;

          const avg = tfScores.reduce((a, b) => a + b, 0) / tfScores.length;
          weightedSum += avg * weight;
          totalWeight += weight;
        }

        biasData[side === "BUY" ? "bullScore" : "bearScore"] =
          totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
        biasData[side === "BUY" ? "bullCount" : "bearCount"] =
          postUpdateDocs.filter(
            (d) => d.autoFilterPassed === true && d.status === "ACTIVE" &&
              !d.tp1Hit && !d.tp2Hit && !d.tp3Hit && !d.slHitAt && d.type === side,
          ).length;
      }

      await db.collection("config").doc("market_bias").set({
        ...biasData,
        lastUpdated: new Date().toISOString(),
      });
    } catch (biasErr: any) {
      console.error("[Sync] Market bias computation failed:", biasErr.message);
    }

    // ── Market Regime Computation (Phase 2) ───────────────
    try {
      const regime = computeMarketRegime(
        postUpdateDocs.map((d) => ({
          timeframe: String(d.timeframe || "15"),
          type: d.type || "BUY",
          autoFilterPassed: d.autoFilterPassed ?? null,
          status: d.status || "ACTIVE",
          price: Number(d.price || 0),
          currentPrice: d.currentPrice != null ? Number(d.currentPrice) : null,
          tp1Hit: d.tp1Hit ?? false,
          slHitAt: d.slHitAt ?? null,
          receivedAt: d.receivedAt || "",
        })),
        previousRegime,
        baseThreshold,
      );
      await db.collection("config").doc("market_regime").set({
        ...regime,
        lastUpdated: new Date().toISOString(),
      });
    } catch (regimeErr: any) {
      console.error("[Sync] Regime computation failed:", regimeErr.message);
    }

    // ── Simulator: market turn detection + score degradation ──
    let marketTurnCloses = 0;
    let scoreDegradedCloses = 0;
    try {
      const simStateDocMT = await db.collection("config").doc("simulator_state").get();
      if (simStateDocMT.exists) {
        let simStateMT = checkDailyReset(simStateDocMT.data() as SimulatorState);

        const openSimSnapMT = await db.collection("simulator_trades")
          .where("status", "==", "OPEN").get();

        if (!openSimSnapMT.empty) {
          const openSimTradesMT = openSimSnapMT.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

          // Build market turn input from all signals
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

          // Group open trades by side+timeframe for batch detection
          const sidesTfs = new Set(openSimTradesMT.map((t) => `${t.side}|${t.timeframe}`));

          for (const key of sidesTfs) {
            const [side, tf] = key.split("|");
            const turn = detectMarketTurn(turnInputs, side as "BUY" | "SELL", tf);

            if (turn.triggered) {
              const tradesToClose = openSimTradesMT.filter(
                (t) => t.side === side && t.timeframe === tf && t.status === "OPEN",
              );

              for (const trade of tradesToClose) {
                const livePrice = trade.currentPrice ?? trade.entryPrice;
                const exitResult = processTradeExit({
                  trade,
                  exitType: "SL",
                  exitPrice: livePrice,
                  state: simStateMT,
                });
                if (exitResult) {
                  simStateMT = exitResult.updatedState;
                  const { id: _mtId, ...mtUpdate } = exitResult.updatedTrade;
                  await db.collection("simulator_trades").doc(trade.id!).update({
                    ...mtUpdate,
                    closeReason: "MARKET_TURN",
                  });
                  await db.collection("simulator_logs").add({
                    ...exitResult.log,
                    action: "MARKET_TURN",
                    details: `${turn.reason} → closed ${trade.symbol} ${trade.side} at $${livePrice}`,
                  });
                  trade.status = "CLOSED";
                  marketTurnCloses++;
                }
              }
            }
          }

          // Individual score degradation check
          for (const trade of openSimTradesMT) {
            if (trade.status === "CLOSED") continue;

            const signalScore = scores.get(trade.signalId);
            const liveScore = signalScore?.score;

            if (liveScore != null && liveScore < SIM_CONFIG.SCORE_FLOOR) {
              const livePrice = trade.currentPrice ?? trade.entryPrice;
              const exitResult = processTradeExit({
                trade,
                exitType: "SL",
                exitPrice: livePrice,
                state: simStateMT,
              });
              if (exitResult) {
                simStateMT = exitResult.updatedState;
                const { id: _sdId, ...sdUpdate } = exitResult.updatedTrade;
                await db.collection("simulator_trades").doc(trade.id!).update({
                  ...sdUpdate,
                  closeReason: "SCORE_DEGRADED",
                });
                await db.collection("simulator_logs").add({
                  ...exitResult.log,
                  action: "SCORE_DEGRADED",
                  details: `${trade.symbol} score dropped to ${liveScore} (floor: ${SIM_CONFIG.SCORE_FLOOR}) → closed at $${livePrice}`,
                });
                trade.status = "CLOSED";
                scoreDegradedCloses++;
              }
            }
          }

          if (marketTurnCloses > 0 || scoreDegradedCloses > 0) {
            await db.collection("config").doc("simulator_state").set(simStateMT);
          }
        }
      }
    } catch (mtErr: any) {
      console.error("[Sync] Market turn / score degradation check failed:", mtErr.message);
    }

    // ── Simulator: incubated signal selection ──────────────
    let incubatedCount = 0;
    try {
      const simStateDoc3 = await db.collection("config").doc("simulator_state").get();
      let simState3: SimulatorState = simStateDoc3.exists
        ? checkDailyReset(simStateDoc3.data() as SimulatorState)
        : createInitialState();

      const biasDoc = await db.collection("config").doc("market_bias").get();
      const bullScore = biasDoc.exists ? (biasDoc.data()?.bullScore ?? 0) : 0;
      const bearScore = biasDoc.exists ? (biasDoc.data()?.bearScore ?? 0) : 0;

      const openSimSnap2 = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();
      const openSimTrades = openSimSnap2.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

      // Build candidates from active AI-passed signals
      const candidates: IncubatedCandidate[] = postUpdateDocs
        .filter((d) =>
          d.autoFilterPassed === true &&
          d.status === "ACTIVE" &&
          d.currentPrice != null &&
          d.price != null &&
          d.stopLoss != null,
        )
        .map((d) => ({
          id: d.id,
          symbol: d.symbol || "",
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

      // Build live win rate map from regime data
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

      // Build algo stats
      const allSignalsForAlgo = postUpdateDocs.map(mapFirestoreSignal);
      const algoTfStats = computeAlgoTfStats(allSignalsForAlgo);
      const algoStatsMap = new Map<string, { winRate: number | null; sampleSize: number }>();
      for (const [key, val] of algoTfStats.entries()) {
        algoStatsMap.set(key, { winRate: val.winRate, sampleSize: val.sampleSize });
      }

      const { selected, skipped: incubSkipped } = selectIncubatedSignals({
        candidates,
        state: simState3,
        bullScore,
        bearScore,
        openTrades: openSimTrades,
        liveWinRates,
        algoStats: algoStatsMap,
      });

      // Open trades for selected incubated signals
      for (const c of selected) {
        const isBuy = c.type === "BUY";
        const slDistancePct = isBuy
          ? (c.currentPrice - c.stopLoss) / c.currentPrice
          : (c.stopLoss - c.currentPrice) / c.currentPrice;

        if (slDistancePct <= 0) continue;

        const leverage = (await import("@/lib/leverage")).getLeverage(c.timeframe);
        const hasStreak = (simState3.consecutiveWins ?? 0) >= SIM_CONFIG.STREAK_WINS_TO_SCALE;
        const riskPct = hasStreak ? SIM_CONFIG.RISK_PER_TRADE_STREAK : SIM_CONFIG.RISK_PER_TRADE_BASE;
        const riskAmount = simState3.capital * riskPct;
        let positionSize = riskAmount / (slDistancePct * leverage);
        if (positionSize > simState3.capital * 0.5 || positionSize < 1) continue;
        positionSize = Math.round(positionSize * 100) / 100;

        const regimeKey = `${c.timeframe}_${c.type}`;
        const liveEntry = liveWinRates.get(regimeKey);
        const algoKey = `${c.algo}|${c.timeframe}`;
        const algoEntry = algoStatsMap.get(algoKey);

        const result = openTrade({
          signal: {
            id: c.id,
            symbol: c.symbol,
            type: c.type,
            timeframe: c.timeframe,
            algo: c.algo,
            price: c.currentPrice,  // actual entry = current market price
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

        await db.collection("simulator_trades").add(result.trade);
        simState3 = result.updatedState;
        result.log.details = `[INCUBATED] ${result.log.details}`;
        await db.collection("simulator_logs").add(result.log);
        incubatedCount++;
      }

      // Log skipped for visibility (top 5 only to avoid noise)
      for (const skip of incubSkipped.slice(0, 5)) {
        await db.collection("simulator_logs").add({
          timestamp: new Date().toISOString(),
          action: "INCUBATED_SKIPPED",
          details: `${skip.symbol}: ${skip.reason}`,
          capital: simState3.capital,
        });
      }

      if (selected.length > 0 || !simStateDoc3.exists) {
        await db.collection("config").doc("simulator_state").set(simState3);
      }
    } catch (incErr: any) {
      console.error("[Sync] Incubated signal selection failed:", incErr.message);
    }

    // ── Live Trade Management (Bybit Auto-Trade) ──────────────
    let liveTradeUpdates = 0;
    let liveTradeFills = 0;
    let liveProtectiveCloses = 0;
    try {
      const autoTradeDoc = await db.collection("users").doc("99V4s5wPXcgmthTaMa0k7YyLm702")
        .collection("secrets").doc("binance").get();

      if (autoTradeDoc.exists && autoTradeDoc.data()?.autoTradeEnabled === true) {
        const atData = autoTradeDoc.data()!;
        const creds: Credentials = {
          apiKey: decrypt(atData.encryptedKey),
          apiSecret: decrypt(atData.encryptedSecret),
          testnet: atData.useTestnet === true,
        };

        const liveTradesSnap = await db.collection("live_trades")
          .where("status", "==", "OPEN").get();

        if (!liveTradesSnap.empty) {
          const liveTrades = liveTradesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LiveTrade));

          for (const lt of liveTrades) {
            try {
              // 1. Check for order fills (TP/SL)
              const fills = await checkOrderFills(lt, creds);

              for (const fill of fills.fills) {
                if (fill.type === "SL") {
                  const slResult = await handleSlFill(lt, fill.price, fill.qty);
                  const { id: _slId, ...slFields } = { id: lt.id, ...slResult.updatedFields };
                  await db.collection("live_trades").doc(lt.id!).update({
                    ...slFields,
                    events: [...(lt.events || []), slResult.newEvent],
                  });
                  const slLog = {
                    timestamp: new Date().toISOString(),
                    action: "SL_HIT",
                    details: `${lt.signalSymbol} ${lt.side} SL hit @ $${fill.price} PnL: $${slResult.newEvent.pnl.toFixed(2)}`,
                    symbol: lt.signalSymbol,
                  };
                  await db.collection("simulator_logs").add(slLog);
                  await db.collection("live_trade_logs").add(slLog);
                  lt.status = "CLOSED";
                  liveTradeFills++;
                } else {
                  const tpLevel = fill.type === "TP1" ? 1 : fill.type === "TP2" ? 2 : 3;
                  const tpResult = await handleTpFill(lt, tpLevel as 1 | 2 | 3, fill.price, fill.qty, creds);
                  const updatedEvents = [...(lt.events || []), tpResult.newEvent];
                  await db.collection("live_trades").doc(lt.id!).update({
                    ...tpResult.updatedFields,
                    events: updatedEvents,
                  });
                  if (tpResult.warnings.length) {
                    const warnLog = {
                      timestamp: new Date().toISOString(),
                      action: "WARNING",
                      details: `${lt.signalSymbol} TP${tpLevel} warnings: ${tpResult.warnings.join("; ")}`,
                      symbol: lt.signalSymbol,
                    };
                    await db.collection("simulator_logs").add(warnLog);
                    await db.collection("live_trade_logs").add(warnLog);
                  }
                  const tpLog = {
                    timestamp: new Date().toISOString(),
                    action: `TP${tpLevel}_HIT`,
                    details: `${lt.signalSymbol} ${lt.side} TP${tpLevel} hit @ $${fill.price} PnL: $${tpResult.newEvent.pnl.toFixed(2)}`,
                    symbol: lt.signalSymbol,
                  };
                  await db.collection("simulator_logs").add(tpLog);
                  await db.collection("live_trade_logs").add(tpLog);
                  // Update local reference for subsequent checks
                  Object.assign(lt, tpResult.updatedFields);
                  lt.events = updatedEvents;
                  liveTradeFills++;
                }
              }

              if (lt.status === "CLOSED") continue;

              // 2. Check trailing SL → breakeven
              const livePrice = perpetualsPriceMap[lt.signalSymbol] ?? spotPriceMap[lt.signalSymbol.replace(/\.P$/i, "")];
              if (livePrice != null && lt.trailingSl == null) {
                const slBeResult = await moveSlToBreakeven(lt, livePrice, creds);
                if (slBeResult.moved && slBeResult.updatedFields && slBeResult.newEvent) {
                  await db.collection("live_trades").doc(lt.id!).update({
                    ...slBeResult.updatedFields,
                    events: [...(lt.events || []), slBeResult.newEvent],
                  });
                  Object.assign(lt, slBeResult.updatedFields);
                  liveTradeUpdates++;
                }
                if (slBeResult.moved) {
                  await db.collection("live_trade_logs").add({
                    timestamp: new Date().toISOString(),
                    action: "SL_TO_BREAKEVEN",
                    details: `${lt.signalSymbol} ${lt.side} SL moved to breakeven @ $${lt.entryPrice}`,
                    symbol: lt.signalSymbol,
                  });
                }
                if (slBeResult.warning) {
                  const warnLog = {
                    timestamp: new Date().toISOString(),
                    action: "WARNING",
                    details: `${lt.signalSymbol} SL→BE: ${slBeResult.warning}`,
                    symbol: lt.signalSymbol,
                  };
                  await db.collection("simulator_logs").add(warnLog);
                  await db.collection("live_trade_logs").add(warnLog);
                }
              }
            } catch (ltErr) {
              console.error(`[Sync] Live trade update failed for ${lt.signalSymbol}:`, ltErr);
            }
          }

          // 3. Protective closes: market turn
          const sidesTfsLive = new Set(liveTrades.filter((t) => t.status === "OPEN").map((t) => `${t.side}|${t.timeframe}`));
          const turnInputsLive: MarketTurnInput[] = postUpdateDocs.map((d) => ({
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

          for (const key of sidesTfsLive) {
            const [side, tf] = key.split("|");
            const turn = detectMarketTurn(turnInputsLive, side as "BUY" | "SELL", tf);

            if (turn.triggered) {
              const tradesToClose = liveTrades.filter(
                (t) => t.side === side && t.timeframe === tf && t.status === "OPEN",
              );
              for (const trade of tradesToClose) {
                const curPrice = perpetualsPriceMap[trade.signalSymbol] ?? trade.entryPrice;
                const closeResult = await protectiveClose(trade, "MARKET_TURN", curPrice, creds);
                await db.collection("live_trades").doc(trade.id!).update({
                  ...closeResult.updatedFields,
                  events: [...(trade.events || []), closeResult.newEvent],
                });
                const turnLog = {
                  timestamp: new Date().toISOString(),
                  action: "MARKET_TURN_CLOSE",
                  details: `${trade.signalSymbol} ${trade.side} closed: ${turn.reason}${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
                  symbol: trade.signalSymbol,
                };
                await db.collection("simulator_logs").add(turnLog);
                await db.collection("live_trade_logs").add(turnLog);
                trade.status = "CLOSED";
                liveProtectiveCloses++;
              }
            }
          }

          // 4. Protective closes: score degradation
          for (const trade of liveTrades) {
            if (trade.status === "CLOSED") continue;
            const signalScore = scores.get(trade.signalId);
            const liveScore = signalScore?.score;

            if (liveScore != null && liveScore < SIM_CONFIG.SCORE_FLOOR) {
              const curPrice = perpetualsPriceMap[trade.signalSymbol] ?? trade.entryPrice;
              const closeResult = await protectiveClose(trade, "SCORE_DEGRADED", curPrice, creds);
              await db.collection("live_trades").doc(trade.id!).update({
                ...closeResult.updatedFields,
                events: [...(trade.events || []), closeResult.newEvent],
              });
              const degLog = {
                timestamp: new Date().toISOString(),
                action: "SCORE_DEGRADED_CLOSE",
                details: `${trade.signalSymbol} score=${liveScore} < ${SIM_CONFIG.SCORE_FLOOR} → closed${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
                symbol: trade.signalSymbol,
              };
              await db.collection("simulator_logs").add(degLog);
              await db.collection("live_trade_logs").add(degLog);
              trade.status = "CLOSED";
              liveProtectiveCloses++;
            }
          }

          // 5. Auto kill switch: daily loss limit check
          try {
            const dailyLossLimit = (atData.dailyLossLimit ?? 5) / 100;

            // Sum realized PnL from all trades closed today
            const todayStart = new Date();
            todayStart.setUTCHours(0, 0, 0, 0);
            const closedTodaySnap = await db.collection("live_trades")
              .where("status", "==", "CLOSED")
              .where("closedAt", ">=", todayStart.toISOString())
              .get();

            let dailyRealizedPnl = 0;
            for (const d of closedTodaySnap.docs) {
              dailyRealizedPnl += (d.data().realizedPnl ?? 0) - (d.data().fees ?? 0);
            }

            // Also include unrealized PnL from open trades
            let unrealizedPnl = 0;
            for (const t of liveTrades) {
              if (t.status !== "OPEN") continue;
              const lp = perpetualsPriceMap[t.signalSymbol] ?? t.entryPrice;
              const priceDiff = t.side === "BUY" ? lp - t.entryPrice : t.entryPrice - lp;
              unrealizedPnl += priceDiff * t.remainingQty * t.leverage;
            }

            const totalDailyPnl = dailyRealizedPnl + unrealizedPnl;
            const capitalBase = liveTrades[0]?.capitalAtEntry ?? 1000;
            const dailyDrawdown = -totalDailyPnl / capitalBase;

            if (dailyDrawdown >= dailyLossLimit) {
              // Close all remaining open trades
              const stillOpen = liveTrades.filter((t) => t.status === "OPEN");
              for (const trade of stillOpen) {
                const curPrice = perpetualsPriceMap[trade.signalSymbol] ?? trade.entryPrice;
                const closeResult = await protectiveClose(trade, "KILL_SWITCH", curPrice, creds);
                await db.collection("live_trades").doc(trade.id!).update({
                  ...closeResult.updatedFields,
                  events: [...(trade.events || []), closeResult.newEvent],
                });
                trade.status = "CLOSED";
                liveProtectiveCloses++;
              }

              // Disable auto-trade
              await db.collection("users").doc("99V4s5wPXcgmthTaMa0k7YyLm702")
                .collection("secrets").doc("binance").update({ autoTradeEnabled: false });

              // Send Telegram alerts (3 times for urgency)
              try {
                const userDoc = await db.collection("users").doc("99V4s5wPXcgmthTaMa0k7YyLm702").get();
                const chatId = userDoc.data()?.telegramChatId;
                if (chatId) {
                  const msg = `🚨 <b>AUTO KILL SWITCH TRIGGERED</b> 🚨\n\n` +
                    `Daily loss limit breached: <b>${(dailyDrawdown * 100).toFixed(1)}%</b> (limit: ${(dailyLossLimit * 100).toFixed(0)}%)\n` +
                    `Daily PnL: <b>$${totalDailyPnl.toFixed(2)}</b>\n` +
                    `Positions closed: <b>${stillOpen.length}</b>\n\n` +
                    `⛔ Auto-trade has been <b>DISABLED</b>.\n` +
                    `Re-enable manually from Settings when ready.`;
                  await sendMessage(chatId, msg);
                  await new Promise((r) => setTimeout(r, 2000));
                  await sendMessage(chatId, `🚨 REMINDER: Auto-trade KILLED. ${stillOpen.length} positions closed. Daily loss: $${totalDailyPnl.toFixed(2)}`);
                  await new Promise((r) => setTimeout(r, 2000));
                  await sendMessage(chatId, `⛔ Auto-trade is OFF. Go to Settings to review and re-enable.`);
                }
              } catch (tgErr) {
                console.error("[Sync] Telegram kill switch alert failed:", tgErr);
              }

              const killLog = {
                timestamp: new Date().toISOString(),
                action: "AUTO_KILL_SWITCH",
                details: `Daily loss ${(dailyDrawdown * 100).toFixed(1)}% >= limit ${(dailyLossLimit * 100).toFixed(0)}%. Closed ${stillOpen.length} positions. Auto-trade disabled.`,
              };
              await db.collection("simulator_logs").add(killLog);
              await db.collection("live_trade_logs").add(killLog);
            }
          } catch (killErr) {
            console.error("[Sync] Auto kill switch check failed:", killErr);
          }
        }
      }
    } catch (liveErr: any) {
      console.error("[Sync] Live trade management failed:", liveErr.message);
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `ASIA SYNC: updated=${updateCount} skipped=${skipCount} events=${signalEvents.length} scored=${scoreCount} incubated=${incubatedCount} mktTurn=${marketTurnCloses} scoreDeg=${scoreDegradedCloses} liveFills=${liveTradeFills} liveUpdates=${liveTradeUpdates} liveProtective=${liveProtectiveCloses}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, skipped: skipCount, events: signalEvents.length, scored: scoreCount, incubated: incubatedCount, marketTurnCloses, scoreDegradedCloses, liveTradeFills, liveTradeUpdates, liveProtectiveCloses });
  } catch (error: any) {
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Sync Failure in Singapore Node",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
