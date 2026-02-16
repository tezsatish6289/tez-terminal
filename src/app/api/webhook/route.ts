
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Production-Ready Ingestion Bridge.
 * Normalizes metadata across various market formats (Crypto, Indian Stocks, US Stocks).
 * Now supports internal Stop Loss tracking for signal lifecycle management.
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
      throw new Error("Missing 'id' parameter in Webhook URL.");
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`Invalid JSON format.`);
    }

    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      throw new Error(`Bridge ID '${webhookId}' not found.`);
    }

    const configData = configSnap.data();
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error(`Authentication failure: Secret key mismatch.`);
    }

    // 1. Symbol Normalization
    const symbol = (body.ticker || body.symbol || body.pair || "UNKNOWN").toUpperCase();
    const exchange = (body.exchange || body.market || "BINANCE").toUpperCase();
    
    // 2. Asset Type Normalization
    const rawAt = (body.asset_type || body.assetType || body.category || body.market_type || "UNCLASSIFIED").toString().toUpperCase().trim();
    let assetType = "UNCLASSIFIED";
    if (rawAt.includes("INDIAN")) assetType = "INDIAN STOCKS";
    else if (rawAt.includes("US") || rawAt.includes("NASDAQ") || rawAt.includes("NYSE")) assetType = "US STOCKS";
    else if (rawAt.includes("CRYPTO")) assetType = "CRYPTO";
    else assetType = rawAt;

    // 3. Signal Type Detection
    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.action || body.type || "").toString().toLowerCase();
    if (rawSide.includes("buy") || rawSide.includes("long")) signalType = "BUY";
    if (rawSide.includes("sell") || rawSide.includes("short")) signalType = "SELL";

    // 4. Price Detection
    const rawPrice = body.price ?? body.close ?? body.price_at_alert ?? body.last_price ?? body.entry;
    let price = 0;
    if (rawPrice !== undefined && rawPrice !== null) {
      price = parseFloat(rawPrice.toString());
    }

    // 5. Internal Stop Loss Detection (Hidden from users)
    const rawSL = body.sl ?? body.stopLoss ?? body.stop_loss ?? body.invalidation;
    let stopLoss = 0;
    if (rawSL !== undefined && rawSL !== null) {
      stopLoss = parseFloat(rawSL.toString());
    }
    
    // 6. Timeframe Mapping
    let rawTf = (body.timeframe || body.interval || "15").toString().toUpperCase().trim();
    const tfMap: Record<string, string> = {
      "1M": "1", "1": "1", "5M": "5", "5": "5", "15M": "15", "15": "15",
      "1H": "60", "60": "60", "4H": "240", "240": "240", "D": "D", "1D": "D", "DAILY": "D"
    };
    const timeframe = tfMap[rawTf] || rawTf;

    const signalData = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: rawBody,
      symbol,
      exchange,
      assetType,
      type: signalType,
      status: "ACTIVE", // Signals start as Active
      price: price, 
      stopLoss: stopLoss, // Saved for internal invalidation
      currentPrice: price, 
      maxUpsidePrice: price, 
      maxDrawdownPrice: price, 
      timeframe: timeframe,
      note: body.note || `Alert for ${symbol}`,
      source: configData.name || "TradingView",
    };

    await addDoc(signalsRef, signalData);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    try {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Ingestion Failure",
        details: error.message,
        webhookId: webhookId || "UNKNOWN",
      });
    } catch (logErr) {}
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
