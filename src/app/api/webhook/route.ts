
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { computeSentiment, type SignalForSentiment } from "@/lib/sentiment";
import { deriveTp3, areTpsValid, areTpDistancesSane, deriveTpsFromRisk } from "@/lib/pnl";

import {
  computeAutoFilter,
  mapFirestoreSignal,
  AUTO_FILTER_THRESHOLD,
  isRegimeStale,
  type MarketRegimeData,
} from "@/lib/auto-filter";
import { normalizeSignalExchange } from "@/lib/exchanges";

/**
 * Webhook ingestion for TradingView alerts.
 *
 * Responsibilities (synchronous, fast):
 *   1. Validate & store the signal
 *   2. Compute sentiment alignment
 *   3. Run AI confidence scoring
 *
 * Trade evaluation, simulator entries, and live execution are handled
 * by the sync-simulator cron (Cron 2) on the next cycle.
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
    const rawExchange = String(body.exchange ?? "BINANCE").toUpperCase();
    const exchange = normalizeSignalExchange(rawExchange); // NSE_DLY → NSE
    const rawAt = String(body.asset_type ?? "CRYPTO").trim();

    // Normalize: "IndianStocks", "INDIAN STOCKS", "indian_stocks" → "INDIAN_STOCKS"
    let assetType = "CRYPTO";
    const upperAt = rawAt.toUpperCase().replace(/\s+/g, "_");
    if (upperAt.includes("INDIAN") || upperAt === "INDIANSTOCKS") assetType = "INDIAN_STOCKS";
    else if (upperAt.includes("COMMOD")) assetType = "COMMODITIES";
    else if (upperAt.includes("US") || upperAt.includes("NASDAQ")) assetType = "US_STOCKS";

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

    // Directional sanity: SL must be on the correct side of entry
    if (signalType !== "NEUTRAL" && price > 0 && stopLoss > 0) {
      const slWrong = (signalType === "BUY" && stopLoss >= price) ||
                      (signalType === "SELL" && stopLoss <= price);
      if (slWrong) {
        await db.collection("logs").add({
          timestamp, level: "ERROR",
          message: "SL on wrong side of entry — signal rejected",
          details: `symbol=${symbol} type=${signalType} price=${price} sl=${stopLoss} tf=${timeframe}`,
          webhookId,
        });
        return NextResponse.json(
          { success: false, message: `SL ($${stopLoss}) is on the wrong side of entry ($${price}) for ${signalType}.` },
          { status: 400 }
        );
      }
    }

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
      autoFilterPassed: true,
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

    let processingResult = "Signal ingested as ACTIVE";

    if (signalType !== "NEUTRAL" && (assetType === "CRYPTO" || assetType === "INDIAN_STOCKS")) {
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
          if (sAt !== assetType.toUpperCase()) continue;
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

          const newIdx = allSignals.findIndex((s) => s.id === docRef.id);
          if (newIdx >= 0) {
            allSignals[newIdx] = { ...allSignals[newIdx], aligned };
          }

          let baseThreshold = AUTO_FILTER_THRESHOLD;
          try {
            const filterCfg = await db.collection("config").doc("auto_filter").get();
            if (filterCfg.exists) {
              const val = filterCfg.data()?.baseThreshold;
              if (typeof val === "number" && val > 0) baseThreshold = val;
            }
          } catch {}

          let threshold = baseThreshold;
          try {
            const regimeDoc = await db.collection("config").doc("market_regime").get();
            if (regimeDoc.exists) {
              const regimeData = regimeDoc.data() as MarketRegimeData;
              const key2 = `${timeframe}_${signalType}`;
              if (
                regimeData?.[key2]?.adjustedThreshold &&
                !isRegimeStale(regimeData[key2].lastUpdated, timeframe)
              ) {
                threshold = regimeData[key2].adjustedThreshold;
              }
            }
          } catch {}

          const scores = computeAutoFilter(allSignals);
          const thisScore = scores.get(docRef.id);

          if (thisScore) {
            scoreUpdate = {
              ...scoreUpdate,
              autoFilterPassed: true,
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
          console.error("[Webhook] AI scoring failed, cron will retry:", scoreErr);
        }

        await db.collection("signals").doc(docRef.id).update(scoreUpdate);

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
        processingResult = `Signal scored (score=${scoreUpdate.confidenceScore}) — trade evaluation deferred to simulator cron`;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[Webhook] Processing pipeline failed:", errMsg);
        processingResult = `Signal ingested, processing error: ${errMsg}`;
      }
    }

    return NextResponse.json({ success: true, message: processingResult });
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

