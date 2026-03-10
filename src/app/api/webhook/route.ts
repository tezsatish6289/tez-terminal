
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { computeSentiment, type SignalForSentiment } from "@/lib/sentiment";
import { deriveTp3, areTpsValid, areTpDistancesSane } from "@/lib/pnl";

import {
  computeAutoFilter,
  buildSentimentMap,
  mapFirestoreSignal,
  mapFirestoreSentiment,
  AUTO_FILTER_THRESHOLD,
  isRegimeStale,
  type MarketRegimeData,
} from "@/lib/auto-filter";

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

    const rawPrice = body.price_at_alert;
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

    if (signalType !== "NEUTRAL" && price > 0 && tp1 != null && tp2 != null) {
      if (!areTpsValid(signalType, price, tp1, tp2)) {
        await db.collection("logs").add({
          timestamp, level: "ERROR",
          message: "TP direction mismatch at ingestion — signal rejected",
          details: `symbol=${symbol} type=${signalType} price=${price} tp1=${tp1} tp2=${tp2} sl=${stopLoss} body=${rawBody}`,
          webhookId,
        });
        return NextResponse.json(
          { success: false, message: `TP direction invalid: ${signalType} signal but TPs are on the wrong side of entry price.` },
          { status: 400 }
        );
      }

      if (!areTpDistancesSane(price, tp1, timeframe)) {
        await db.collection("logs").add({
          timestamp, level: "ERROR",
          message: "TP distance too large — signal rejected",
          details: `symbol=${symbol} type=${signalType} price=${price} tp1=${tp1} tp2=${tp2} sl=${stopLoss} tf=${timeframe} tp1Dist=${(Math.abs(tp1 - price) / price * 100).toFixed(2)}% body=${rawBody}`,
          webhookId,
        });
        return NextResponse.json(
          { success: false, message: `TP1 distance from entry is irrationally large for ${timeframe} timeframe.` },
          { status: 400 }
        );
      }
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
      tp1: tp1,
      tp2: tp2,
      tp3: (tp1 != null && tp2 != null) ? deriveTp3(tp1, tp2) : null,
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

            const sentimentSnap = await db
              .collection("sentiment_signals")
              .orderBy("receivedAt", "desc")
              .limit(100)
              .get();
            const sentimentReadings = sentimentSnap.docs.map((d) =>
              mapFirestoreSentiment(d.data()),
            );
            const btcSentiment = buildSentimentMap(sentimentReadings);

            // Read market regime for dynamic threshold
            let threshold = AUTO_FILTER_THRESHOLD;
            try {
              const regimeDoc = await db.collection("config").doc("market_regime").get();
              if (regimeDoc.exists) {
                const regimeData = regimeDoc.data() as MarketRegimeData;
                const key = `${timeframe}_${signalType}`;
                if (
                  regimeData?.[key]?.adjustedThreshold &&
                  !isRegimeStale(regimeData[key].lastUpdated)
                ) {
                  threshold = regimeData[key].adjustedThreshold;
                }
              }
            } catch {}

            const scores = computeAutoFilter(allSignals, btcSentiment);
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
            const tp3Val = (tp1 != null && tp2 != null) ? deriveTp3(tp1, tp2) : null;
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
              tp1, tp2, tp3: tp3Val,
              guidance: "New signal received.",
              createdAt: timestamp,
              notified: false,
              notifiedAt: null,
            });
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
