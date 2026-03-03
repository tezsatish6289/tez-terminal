
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, getDocs, query, where, limit, updateDoc, serverTimestamp } from "firebase/firestore";
import { computeSentiment, type SignalForSentiment } from "@/lib/sentiment";
import { deriveTp3 } from "@/lib/pnl";
import type { SignalEvent } from "@/lib/telegram";

/**
 * Webhook ingestion for TradingView alerts.
 * Auth + write happen synchronously for a fast response.
 * Sentiment/alignment is computed in the background via next/server after().
 */
export async function POST(request: NextRequest) {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  const signalsRef = collection(firestore, "signals");
  
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

    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      throw new Error(`Bridge ID '${webhookId}' not found. Did you purge the webhooks collection?`);
    }

    const configData = configSnap.data();
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

    const signalData: Record<string, any> = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
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
    };

    const docRef = await addDoc(signalsRef, signalData);

    const tp3Val = (tp1 != null && tp2 != null) ? deriveTp3(tp1, tp2) : null;
    const newSignalEvent: SignalEvent = {
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
    };
    await addDoc(collection(firestore, "signal_events"), {
      ...newSignalEvent,
      createdAt: timestamp,
      notified: false,
      notifiedAt: null,
    });

    // Compute alignment in the background — runs after the response is sent
    if (signalType !== "NEUTRAL" && assetType === "CRYPTO") {
      after(async () => {
        try {
          const activeSnap = await getDocs(
            query(collection(firestore, "signals"), where("status", "==", "ACTIVE"), limit(200))
          );

          let k = 7;
          try {
            const sentimentConfig = await getDoc(doc(firestore, "config", "sentiment"));
            if (sentimentConfig.exists()) {
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

          await updateDoc(doc(firestore, "signals", docRef.id), {
            aligned,
            sentimentAtEntry: sentiment.label,
          });
        } catch (err) {
          console.error("[Webhook after()] Alignment computation failed:", err);
        }
      });
    }

    return NextResponse.json({ success: true, message: "Signal ingested as ACTIVE" });
  } catch (error: any) {
    console.error("[Webhook Bridge Error]", error.message);
    try {
      await addDoc(logsRef, {
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
