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
  fetchAllExchangePrices,
  serializePrices,
  getReferencePrice,
  getConnector,
  isStockExchange,
  type AllExchangePrices,
} from "@/lib/exchanges";
import { ensureValidToken } from "@/lib/dhan-token";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * CRON 1: PRICE SYNC + SIGNAL LIFECYCLE + SCORING + MARKET INTELLIGENCE
 *
 * Fetches prices from ALL exchanges, updates signal TP/SL tracking,
 * rescores AI confidence, computes market bias and regime.
 *
 * Does NOT manage simulator trades or live trades — those are in
 * separate crons for isolation and parallelism.
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
    // ── 1. Fetch prices from ALL exchanges in parallel ──────
    const allPrices: AllExchangePrices = await fetchAllExchangePrices();

    // ── 1b. Fetch Indian stock prices via Dhan (with 10s hard cap) ─
    let dhanPriceCount = 0;
    try {
      await Promise.race([
        (async () => {
          const dhanCreds = await ensureValidToken();
          if (!dhanCreds) return;

          const activeSnap = await db.collection("signals")
            .where("status", "==", "ACTIVE")
            .get();

          const stockSymbols = new Set<string>();
          for (const d of activeSnap.docs) {
            const s = d.data();
            const exchange = String(s.exchange ?? "").toUpperCase();
            if (isStockExchange(exchange) || String(s.assetType ?? "").toUpperCase().includes("INDIAN")) {
              const raw = String(s.symbol ?? "").replace(/\.(NS|NSE)$/i, "").toUpperCase();
              if (raw) stockSymbols.add(raw);
            }
          }

          if (stockSymbols.size > 0) {
            const dhan = getConnector("DHAN") as import("@/lib/exchanges/dhan").DhanConnector;
            await dhan.loadInstruments();

            const priceMap = await dhan.fetchPricesBySymbol([...stockSymbols], dhanCreds);
            for (const [sym, price] of priceMap) {
              allPrices.DHAN.set(sym, price);
              dhanPriceCount++;
            }
          }
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Dhan fetch timeout (10s)")), 10000)),
      ]);
    } catch (dhanErr: any) {
      console.error("[Sync] Dhan price fetch failed:", dhanErr.message);
    }

    // Cache prices in Firestore for other crons to read
    await db.collection("config").doc("exchange_prices").set({
      ...serializePrices(allPrices),
      updatedAt: new Date().toISOString(),
    });

    // ── 2. Update signal prices + TP/SL lifecycle ───────────
    const signalsSnap = await db.collection("signals").get();
    let updateCount = 0;
    let skipCount = 0;
    const signalEvents: SignalEvent[] = [];
    const postUpdateDocs: { id: string; [key: string]: any }[] = [];

    const priceBatch = db.batch();
    let priceBatchCount = 0;

    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;
      const rawSymbol = (signal.symbol || "").split(':').pop() || "";
      const signalExchange = signal.exchange ?? "BINANCE";
      const currentPrice = getReferencePrice(allPrices, rawSymbol, signalExchange);

      if (!currentPrice) {
        skipCount++;
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
        currentPrice,
        maxUpsidePrice: newMaxUpside,
        maxDrawdownPrice: newMaxDrawdown,
        lastSyncAt: new Date().toISOString()
      };

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

      if (tpsValid && tpDistanceSane && tp1 != null && tp2 != null && tp3 != null) {
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
      } else {
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

      priceBatch.update(db.collection("signals").doc(signalDoc.id), updateData);
      priceBatchCount++;
      postUpdateDocs.push({ id: signalDoc.id, ...signal, ...updateData });
      updateCount++;

      if (priceBatchCount >= 490) {
        await priceBatch.commit();
        priceBatchCount = 0;
      }
    }

    if (priceBatchCount > 0) {
      await priceBatch.commit();
    }

    // Include non-active signals for historical stats
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status === "ACTIVE") continue;
      postUpdateDocs.push({ id: signalDoc.id, ...signal });
    }

    if (signalEvents.length > 0) {
      const evtBatch = db.batch();
      for (const evt of signalEvents) {
        evtBatch.set(db.collection("signal_events").doc(), {
          ...evt,
          createdAt: new Date().toISOString(),
          notified: false,
          notifiedAt: null,
        });
      }
      await evtBatch.commit();
    }

    // ── 3. AI Filter Rescoring ──────────────────────────────
    let scoreCount = 0;
    let previousRegime: MarketRegimeData | undefined;
    let baseThreshold = AUTO_FILTER_THRESHOLD;
    let scores = new Map<string, { signalId: string; score: number; label: string; color: string; breakdown: any }>();
    try {
      try {
        const filterCfg = await db.collection("config").doc("auto_filter").get();
        if (filterCfg.exists) {
          const val = filterCfg.data()?.baseThreshold;
          if (typeof val === "number" && val > 0) baseThreshold = val;
        }
      } catch {}

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

      const scoreBatch = db.batch();
      let scoreBatchCount = 0;

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

        if (scoreResult) {
          scoreData.confidenceScore = scoreResult.score;
          scoreData.confidenceLabel = scoreResult.label;
          scoreData.scoreBreakdown = scoreResult.breakdown;
          scoreData.scoredAtThreshold = threshold;
          if (signal.initialConfidenceScore == null) {
            scoreData.initialConfidenceScore = scoreResult.score;
          }
          const existingMax = signal.maxConfidenceScore ?? scoreResult.score;
          const existingMin = signal.minConfidenceScore ?? scoreResult.score;
          scoreData.maxConfidenceScore = Math.max(existingMax, scoreResult.score);
          scoreData.minConfidenceScore = Math.min(existingMin, scoreResult.score);
        } else if (isSignalStale(signal.receivedAt, signal.timeframe || "15")) {
          scoreData.confidenceScore = 0;
          scoreData.confidenceLabel = "Stale";
          scoreData.scoredAtThreshold = threshold;
        }

        if (Object.keys(scoreData).length > 1) {
          scoreBatch.update(db.collection("signals").doc(signalDoc.id), scoreData);
          scoreBatchCount++;
          scoreCount++;

          if (scoreBatchCount >= 490) {
            await scoreBatch.commit();
            scoreBatchCount = 0;
          }
        }
      }

      if (scoreBatchCount > 0) {
        await scoreBatch.commit();
      }
    } catch (scoreErr: any) {
      console.error("[Sync] AI rescoring failed:", scoreErr.message);
    }

    // ── 4. Market Bias ──────────────────────────────────────
    try {
      const TF_WEIGHTS: Record<string, number> = { "5": 1, "15": 2, "60": 3, "240": 4 };
      const biasData: Record<string, number> = {};

      for (const side of ["BUY", "SELL"] as const) {
        let weightedSum = 0;
        let totalWeight = 0;

        for (const [tf, weight] of Object.entries(TF_WEIGHTS)) {
          const tfSignals = postUpdateDocs.filter(
            (d) =>
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
            (d) => d.status === "ACTIVE" &&
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

    // ── 5. Market Regime ────────────────────────────────────
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

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `PRICE SYNC: updated=${updateCount} skipped=${skipCount} events=${signalEvents.length} scored=${scoreCount} dhan=${dhanPriceCount} exchanges=${Object.keys(allPrices).filter(k => allPrices[k as keyof AllExchangePrices].size > 0).length}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      updated: updateCount,
      skipped: skipCount,
      events: signalEvents.length,
      scored: scoreCount,
    });
  } catch (error: any) {
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Price Sync Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
