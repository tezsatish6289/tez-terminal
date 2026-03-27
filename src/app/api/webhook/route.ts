
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { computeSentiment, type SignalForSentiment } from "@/lib/sentiment";
import { deriveTp3, areTpsValid, areTpDistancesSane, deriveTpsFromRisk, isSlDistanceSane } from "@/lib/pnl";

import {
  computeAutoFilter,
  computeAlgoTfStats,
  mapFirestoreSignal,
  AUTO_FILTER_THRESHOLD,
  isRegimeStale,
  type MarketRegimeData,
} from "@/lib/auto-filter";
import {
  evaluateTrade,
  openTrade,
  checkDailyReset,
  createInitialState,
  type SimulatorState,
  type SimTrade,
} from "@/lib/simulator";
import { executeTrade as executeExchangeTrade, type Credentials } from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";

/**
 * Webhook ingestion for TradingView alerts.
 * Auth + write happen synchronously for a fast response.
 * Sentiment/alignment is computed in the background via next/server after().
 */
export async function POST(request: NextRequest) {
  const db = getAdminFirestore();

  const timestamp = new Date().toISOString();
  let webhookId = "UNKNOWN";
  let rawBody = "";

  try {
    const { searchParams } = new URL(request.url);
    webhookId = searchParams.get("id") || "MISSING_ID";
    
    try {
      rawBody = await request.text();
    } catch (e) {
      rawBody = "UNREADABLE_BODY";
    }

    if (webhookId === "MISSING_ID") {
      throw new Error("Critical: Missing 'id' parameter in Webhook URL.");
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`Invalid JSON: Ensure TradingView is sending valid JSON content.`);
    }

    const configSnap = await db.collection("webhooks").doc(webhookId).get();

    if (!configSnap.exists) {
      throw new Error(`Bridge ID '${webhookId}' not found. Did you purge the webhooks collection?`);
    }

    const configData = configSnap.data()!;
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error(`Auth Failure: Secret key mismatch for bridge '${configData.name}'.`);
    }

    const symbol = String(body.ticker ?? "UNKNOWN").toUpperCase();
    const exchange = String(body.exchange ?? "BINANCE").toUpperCase();
    const rawAt = String(body.asset_type ?? "CRYPTO").toUpperCase().trim();
    let assetType = "CRYPTO";
    if (rawAt.includes("INDIAN")) assetType = "INDIAN STOCKS";
    else if (rawAt.includes("US") || rawAt.includes("NASDAQ")) assetType = "US STOCKS";

    // Only accept USDT perpetual symbols for crypto
    if (assetType === "CRYPTO" && !symbol.endsWith("USDT.P")) {
      await db.collection("logs").add({
        timestamp, level: "WARN",
        message: "Symbol rejected — not a USDT perpetual",
        details: `symbol=${symbol} expected=*.USDT.P`,
        webhookId,
      });
      return NextResponse.json(
        { success: false, message: `Symbol '${symbol}' rejected. Only USDT perpetual symbols (ending with USDT.P) are accepted.` },
        { status: 400 }
      );
    }

    const rawSide = String(body.side ?? "").toLowerCase();
    const signalType = rawSide.includes("sell") ? "SELL" : rawSide.includes("buy") ? "BUY" : "NEUTRAL";

    const rawPrice = body.price_at_alert ?? body.price;
    let price = 0;
    if (rawPrice != null && rawPrice !== "") {
      const parsed = parseFloat(String(rawPrice).trim());
      if (!Number.isNaN(parsed)) price = parsed;
    }

    const rawSL = body.stopLoss;
    const stopLoss = rawSL != null && rawSL !== "" ? parseFloat(String(rawSL).trim()) : 0;

    const rawTp1 = body.tp1;
    const tp1 = rawTp1 != null && rawTp1 !== "" ? parseFloat(String(rawTp1).trim()) : null;
    const rawTp2 = body.tp2;
    const tp2 = rawTp2 != null && rawTp2 !== "" ? parseFloat(String(rawTp2).trim()) : null;

    const rawTf = String(body.timeframe ?? "15").toUpperCase().trim();
    const tfMap: Record<string, string> = {
      "1M": "1", "5M": "5", "15M": "15", "1H": "60", "4H": "240", "D": "D", "1D": "D"
    };
    const timeframe = tfMap[rawTf] || rawTf;

    const algo = String(body.algo || "V8 Reversal").trim();

    // Reject signals with SL too wide for the timeframe's leverage
    if (signalType !== "NEUTRAL" && price > 0 && stopLoss > 0) {
      if (!isSlDistanceSane(price, stopLoss, timeframe)) {
        const slPct = (Math.abs(price - stopLoss) / price * 100).toFixed(2);
        await db.collection("logs").add({
          timestamp, level: "ERROR",
          message: "SL distance too wide for timeframe — signal rejected",
          details: `symbol=${symbol} type=${signalType} price=${price} sl=${stopLoss} slDist=${slPct}% tf=${timeframe}`,
          webhookId,
        });
        return NextResponse.json(
          { success: false, message: `SL distance ${slPct}% too wide for ${timeframe} timeframe.` },
          { status: 400 }
        );
      }
    }

    // Resolve TP values: use incoming if valid, else derive from SL distance
    let finalTp1 = tp1;
    let finalTp2 = tp2;
    let finalTp3: number | null = null;
    let tpSource: "webhook" | "derived" = "webhook";

    if (signalType !== "NEUTRAL" && price > 0) {
      const incomingTpsOk =
        tp1 != null &&
        tp2 != null &&
        areTpsValid(signalType, price, tp1, tp2) &&
        areTpDistancesSane(price, tp1, timeframe);

      if (!incomingTpsOk && stopLoss > 0) {
        const derived = deriveTpsFromRisk(signalType, price, stopLoss);
        if (derived) {
          finalTp1 = derived.tp1;
          finalTp2 = derived.tp2;
          finalTp3 = derived.tp3;
          tpSource = "derived";
          await db.collection("logs").add({
            timestamp, level: "WARN",
            message: "TPs invalid — recalculated from SL distance (1.5R/2.5R/3.5R)",
            details: `symbol=${symbol} type=${signalType} price=${price} originalTp1=${tp1} originalTp2=${tp2} sl=${stopLoss} newTp1=${finalTp1} newTp2=${finalTp2} newTp3=${finalTp3}`,
            webhookId,
          });
        }
      }
    }

    if (finalTp3 === null && finalTp1 != null && finalTp2 != null) {
      finalTp3 = deriveTp3(finalTp1, finalTp2);
    }

    const signalData: Record<string, any> = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: FieldValue.serverTimestamp(),
      payload: rawBody,
      symbol,
      exchange,
      assetType,
      type: signalType,
      status: "ACTIVE",
      price: price, 
      stopLoss: stopLoss,
      originalStopLoss: stopLoss,
      currentPrice: price, 
      maxUpsidePrice: price, 
      maxDrawdownPrice: price, 
      timeframe: timeframe,
      algo,
      note: body.note || `Alert for ${symbol}`,
      source: configData.name || "TradingView",
      aligned: false,
      sentimentAtEntry: "",
      tpSource,
      tp1: finalTp1,
      tp2: finalTp2,
      tp3: finalTp3,
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      slHitAt: null,
      tp1BookedPnl: null,
      tp2BookedPnl: null,
      tp3BookedPnl: null,
      slBookedPnl: null,
      totalBookedPnl: null,
      autoFilterPassed: null,
      confidenceScore: null,
      confidenceLabel: null,
      scoreBreakdown: null,
      lastScoredAt: null,
      initialConfidenceScore: null,
      maxConfidenceScore: null,
      minConfidenceScore: null,
      telegramNotified: false,
    };

    const docRef = await db.collection("signals").add(signalData);

    if (signalType !== "NEUTRAL" && assetType === "CRYPTO") {
      after(async () => {
        try {
          const activeSnap = await db.collection("signals")
            .where("status", "==", "ACTIVE")
            .limit(200)
            .get();

          let k = 7;
          try {
            const sentimentConfig = await db.collection("config").doc("sentiment").get();
            if (sentimentConfig.exists) {
              const ck = sentimentConfig.data()?.k;
              if (typeof ck === "number" && ck > 0) k = ck;
            }
          } catch {}

          const tfSignals: SignalForSentiment[] = [];
          for (const d of activeSnap.docs) {
            const s = d.data();
            const sTf = String(s.timeframe || "").toUpperCase();
            if (sTf !== timeframe.toUpperCase()) continue;
            const sAt = String(s.assetType || "CRYPTO").toUpperCase();
            if (!sAt.includes("CRYPTO") && sAt !== "CRYPTO") continue;
            tfSignals.push({
              type: s.type === "BUY" ? "BUY" : "SELL",
              receivedAt: s.receivedAt,
              currentPrice: s.currentPrice ?? null,
              price: Number(s.price || 0),
            });
          }

          const sentiment = computeSentiment(tfSignals, timeframe, k);
          const bullish = sentiment.label === "Bulls in control" || sentiment.label === "Bulls taking over";
          const bearish = sentiment.label === "Bears in control" || sentiment.label === "Bears taking over";
          const aligned = (signalType === "BUY" && bullish) || (signalType === "SELL" && bearish);

          // ── AI Filter Scoring ───────────────────────────
          let scoreUpdate: Record<string, any> = {
            aligned,
            sentimentAtEntry: sentiment.label,
          };

          try {
            const allSignals = activeSnap.docs.map((d) =>
              mapFirestoreSignal({ id: d.id, ...d.data() }),
            );

            // Ensure the new signal has the aligned flag for scoring
            const newIdx = allSignals.findIndex((s) => s.id === docRef.id);
            if (newIdx >= 0) {
              allSignals[newIdx] = { ...allSignals[newIdx], aligned };
            }

            // Read configurable base threshold
            let baseThreshold = AUTO_FILTER_THRESHOLD;
            try {
              const filterCfg = await db.collection("config").doc("auto_filter").get();
              if (filterCfg.exists) {
                const val = filterCfg.data()?.baseThreshold;
                if (typeof val === "number" && val > 0) baseThreshold = val;
              }
            } catch {}

            // Read market regime for dynamic threshold
            let threshold = baseThreshold;
            try {
              const regimeDoc = await db.collection("config").doc("market_regime").get();
              if (regimeDoc.exists) {
                const regimeData = regimeDoc.data() as MarketRegimeData;
                const key = `${timeframe}_${signalType}`;
                if (
                  regimeData?.[key]?.adjustedThreshold &&
                  !isRegimeStale(regimeData[key].lastUpdated, timeframe)
                ) {
                  threshold = regimeData[key].adjustedThreshold;
                }
              }
            } catch {}

            const scores = computeAutoFilter(allSignals);
            const thisScore = scores.get(docRef.id);

            if (thisScore) {
              const passed = thisScore.score >= threshold;
              scoreUpdate = {
                ...scoreUpdate,
                autoFilterPassed: passed,
                confidenceScore: thisScore.score,
                confidenceLabel: thisScore.label,
                scoreBreakdown: thisScore.breakdown,
                lastScoredAt: new Date().toISOString(),
                scoredAtThreshold: threshold,
                initialConfidenceScore: thisScore.score,
                maxConfidenceScore: thisScore.score,
                minConfidenceScore: thisScore.score,
              };
            }
          } catch (scoreErr) {
            console.error("[Webhook after()] AI scoring failed, cron will retry:", scoreErr);
          }

          await db.collection("signals").doc(docRef.id).update(scoreUpdate);

          // Only create the NEW_SIGNAL event if AI filter passed
          if (scoreUpdate.autoFilterPassed === true) {
            await db.collection("signal_events").add({
              type: "NEW_SIGNAL",
              signalId: docRef.id,
              symbol,
              side: signalType as "BUY" | "SELL",
              timeframe,
              assetType,
              entryPrice: price,
              price,
              stopLoss,
              tp1: finalTp1, tp2: finalTp2, tp3: finalTp3,
              guidance: "New signal received.",
              createdAt: timestamp,
              notified: false,
              notifiedAt: null,
            });

            // ── Simulator: evaluate and possibly open trade ──
            try {
              const simStateDoc = await db.collection("config").doc("simulator_state").get();
              let simState: SimulatorState = simStateDoc.exists
                ? simStateDoc.data() as SimulatorState
                : createInitialState();
              simState = checkDailyReset(simState);

              const biasDoc = await db.collection("config").doc("market_bias").get();
              const bullScore = biasDoc.exists ? (biasDoc.data()?.bullScore ?? 0) : 0;
              const bearScore = biasDoc.exists ? (biasDoc.data()?.bearScore ?? 0) : 0;

              const regimeDoc2 = await db.collection("config").doc("market_regime").get();
              const regimeData2 = regimeDoc2.exists ? regimeDoc2.data() : {};
              const regimeKey = `${timeframe}_${signalType}`;
              const regimeEntry = regimeData2?.[regimeKey];
              const liveWinRate = regimeEntry?.winRate ?? null;
              const liveSampleSize = regimeEntry?.sampleSize ?? 0;

              const allSignals2 = activeSnap.docs.map((d) =>
                mapFirestoreSignal({ id: d.id, ...d.data() }),
              );
              const algoStats = computeAlgoTfStats(allSignals2);
              const algoKey = `${algo}|${timeframe}`;
              const algoEntry = algoStats.get(algoKey);
              const algoWinRate = algoEntry?.winRate ?? null;
              const algoSampleSize = algoEntry?.sampleSize ?? 0;

              const openTradesSnap = await db.collection("simulator_trades")
                .where("status", "==", "OPEN").get();
              const openTrades = openTradesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

              const evaluation = evaluateTrade({
                state: simState,
                signal: {
                  id: docRef.id,
                  symbol,
                  type: signalType as "BUY" | "SELL",
                  timeframe,
                  algo,
                  price,
                  stopLoss,
                  tp1: finalTp1,
                  tp2: finalTp2,
                  tp3: finalTp3,
                  confidenceScore: scoreUpdate.confidenceScore ?? 0,
                },
                bullScore,
                bearScore,
                liveWinRate,
                liveSampleSize,
                algoWinRate,
                algoSampleSize,
                openTrades,
              });

              // Persist initial state if it didn't exist yet
              if (!simStateDoc.exists) {
                await db.collection("config").doc("simulator_state").set(simState);
              }

              if (evaluation.canTrade && evaluation.positionSize) {
                const result = openTrade({
                  signal: {
                    id: docRef.id,
                    symbol,
                    type: signalType as "BUY" | "SELL",
                    timeframe,
                    algo,
                    price,
                    stopLoss,
                    tp1: finalTp1!,
                    tp2: finalTp2!,
                    tp3: finalTp3!,
                    confidenceScore: scoreUpdate.confidenceScore ?? 0,
                  },
                  positionSize: evaluation.positionSize,
                  state: simState,
                  bullScore,
                  bearScore,
                  liveWinRate: liveWinRate ?? 0,
                  algoWinRate: algoWinRate ?? 0,
                });

                const simTradeRef = await db.collection("simulator_trades").add(result.trade);
                await db.collection("config").doc("simulator_state").set(result.updatedState);
                await db.collection("simulator_logs").add(result.log);

                // ── Auto-Trade: execute on Bybit if enabled ──
                try {
                  const autoTradeDoc = await db.collection("users").doc("99V4s5wPXcgmthTaMa0k7YyLm702")
                    .collection("secrets").doc("binance").get();

                  if (autoTradeDoc.exists) {
                    const atData = autoTradeDoc.data()!;
                    if (atData.autoTradeEnabled === true) {
                      const creds: Credentials = {
                        apiKey: decrypt(atData.encryptedKey),
                        apiSecret: decrypt(atData.encryptedSecret),
                      };

                      const liveResult = await executeExchangeTrade(
                        result.trade,
                        "99V4s5wPXcgmthTaMa0k7YyLm702",
                        simTradeRef.id,
                        simState.capital,
                        creds,
                      );

                      if (liveResult.success && liveResult.trade) {
                        await db.collection("live_trades").add(liveResult.trade);
                        await db.collection("simulator_logs").add({
                          timestamp: new Date().toISOString(),
                          action: "LIVE_TRADE_OPENED",
                          details: `${symbol} ${signalType} executed on Bybit @ $${liveResult.trade.entryPrice} qty=${liveResult.trade.quantity}${liveResult.warnings.length ? ` warnings: ${liveResult.warnings.join("; ")}` : ""}`,
                          signalId: docRef.id,
                          symbol,
                          capital: simState.capital,
                        });
                      } else {
                        await db.collection("simulator_logs").add({
                          timestamp: new Date().toISOString(),
                          action: "LIVE_TRADE_FAILED",
                          details: `${symbol} ${signalType} Bybit execution failed: ${liveResult.error}`,
                          signalId: docRef.id,
                          symbol,
                        });
                      }
                    }
                  }
                } catch (liveErr) {
                  console.error("[Webhook] Auto-trade execution failed:", liveErr);
                  await db.collection("simulator_logs").add({
                    timestamp: new Date().toISOString(),
                    action: "LIVE_TRADE_ERROR",
                    details: `Auto-trade error: ${liveErr instanceof Error ? liveErr.message : String(liveErr)}`,
                    signalId: docRef.id,
                    symbol,
                  }).catch(() => {});
                }
              } else {
                await db.collection("simulator_logs").add({
                  timestamp: new Date().toISOString(),
                  action: "SIGNAL_SKIPPED",
                  details: evaluation.reason,
                  signalId: docRef.id,
                  symbol,
                  capital: simState.capital,
                });
              }
            } catch (simErr) {
              console.error("[Webhook] Simulator evaluation failed:", simErr);
              await db.collection("simulator_logs").add({
                timestamp: new Date().toISOString(),
                action: "ERROR",
                details: `Simulator evaluation error: ${simErr instanceof Error ? simErr.message : String(simErr)}`,
                signalId: docRef.id,
                symbol,
              }).catch(() => {});
            }
          } else {
            // Signal didn't pass AI filter — log for visibility
            try {
              await db.collection("simulator_logs").add({
                timestamp: new Date().toISOString(),
                action: "SIGNAL_SKIPPED",
                details: `AI filter not passed (score=${scoreUpdate.confidenceScore ?? "?"} threshold=${scoreUpdate.scoredAtThreshold ?? "?"})`,
                signalId: docRef.id,
                symbol,
              });
            } catch {}
          }
        } catch (err) {
          console.error("[Webhook after()] Background processing failed:", err);
        }
      });
    }

    return NextResponse.json({ success: true, message: "Signal ingested as ACTIVE" });
  } catch (error: any) {
    console.error("[Webhook Bridge Error]", error.message);
    try {
      await db.collection("logs").add({
        timestamp,
        level: "ERROR",
        message: "Ingestion Failure",
        details: `Body: ${rawBody}\nError: ${error.message}`,
        webhookId: webhookId || "UNKNOWN",
      });
    } catch (logErr) {}
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
