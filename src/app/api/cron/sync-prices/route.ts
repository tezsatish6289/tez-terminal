import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { rawPnlPercent, calcBookedPnl, deriveTp3, areTpsValid, areTpDistancesSane } from "@/lib/pnl";
import type { SignalEvent } from "@/lib/telegram";
import {
  computeAutoFilter,
  buildSentimentMap,
  mapFirestoreSignal,
  mapFirestoreSentiment,
  isSignalStale,
  AUTO_FILTER_THRESHOLD,
  isRegimeStale,
  computeMarketRegime,
  type MarketRegimeData,
} from "@/lib/auto-filter";

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

    // ── AI Filter Rescoring Pass ──────────────────────────
    let scoreCount = 0;
    let previousRegime: MarketRegimeData | undefined;
    try {
      const sentimentSnap = await db
        .collection("sentiment_signals")
        .orderBy("receivedAt", "desc")
        .limit(100)
        .get();
      const sentimentReadings = sentimentSnap.docs.map((d) =>
        mapFirestoreSentiment(d.data()),
      );
      const btcSentiment = buildSentimentMap(sentimentReadings);

      // Read existing regime for dynamic thresholds + smoothing history
      let regimeData: Record<string, any> = {};
      try {
        const regimeDoc = await db.collection("config").doc("market_regime").get();
        if (regimeDoc.exists) {
          const raw = regimeDoc.data() || {};
          previousRegime = raw as MarketRegimeData;
          if (!isRegimeStale(raw.lastUpdated as string | undefined)) {
            regimeData = raw;
          }
        }
      } catch {}

      const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
      const scores = computeAutoFilter(allSignalsForScoring, btcSentiment);

      for (const signalDoc of signalsSnap.docs) {
        const signal = signalDoc.data();
        if (signal.status !== "ACTIVE") continue;
        if (signal.tp1Hit || signal.tp2Hit || signal.tp3Hit || signal.slHitAt) continue;

        const scoreResult = scores.get(signalDoc.id);
        const scoreData: Record<string, any> = {
          lastScoredAt: new Date().toISOString(),
        };

        const regimeKey = `${signal.timeframe || "15"}_${signal.type || "BUY"}`;
        const threshold = regimeData[regimeKey]?.adjustedThreshold ?? AUTO_FILTER_THRESHOLD;

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
      );
      await db.collection("config").doc("market_regime").set({
        ...regime,
        lastUpdated: new Date().toISOString(),
      });
    } catch (regimeErr: any) {
      console.error("[Sync] Regime computation failed:", regimeErr.message);
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `ASIA SYNC: updated=${updateCount} skipped=${skipCount} events=${signalEvents.length} scored=${scoreCount}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, skipped: skipCount, events: signalEvents.length, scored: scoreCount });
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
