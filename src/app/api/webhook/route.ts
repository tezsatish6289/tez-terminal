
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Production-Ready Ingestion Bridge.
 * Hardened to handle Stop Loss lifecycle and robust error logging.
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

    // Normalize Data
    const symbol = (body.ticker || body.symbol || body.pair || "UNKNOWN").toUpperCase();
    const exchange = (body.exchange || body.market || "BINANCE").toUpperCase();
    
    const rawAt = (body.asset_type || body.assetType || body.category || "CRYPTO").toString().toUpperCase().trim();
    let assetType = "CRYPTO";
    if (rawAt.includes("INDIAN")) assetType = "INDIAN STOCKS";
    else if (rawAt.includes("US") || rawAt.includes("NASDAQ")) assetType = "US STOCKS";

    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.action || body.type || "").toString().toLowerCase();
    if (rawSide.includes("buy") || rawSide.includes("long")) signalType = "BUY";
    if (rawSide.includes("sell") || rawSide.includes("short")) signalType = "SELL";

    const rawPrice = body.price ?? body.close ?? body.entry;
    const price = rawPrice ? parseFloat(rawPrice.toString()) : 0;

    const rawSL = body.sl ?? body.stopLoss ?? body.stop_loss;
    const stopLoss = rawSL ? parseFloat(rawSL.toString()) : 0;
    
    const rawTf = (body.timeframe || body.interval || "15").toString().toUpperCase().trim();
    const tfMap: Record<string, string> = {
      "1M": "1", "5M": "5", "15M": "15", "1H": "60", "4H": "240", "D": "D", "1D": "D"
    };
    const timeframe = tfMap[rawTf] || rawTf;

    // MANDATORY INITIALIZATION: Every signal MUST start as ACTIVE
    const signalData = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: rawBody,
      symbol,
      exchange,
      assetType,
      type: signalType,
      status: "ACTIVE", // The Bridge initializes the lifecycle
      price: price, 
      stopLoss: stopLoss, 
      currentPrice: price, 
      maxUpsidePrice: price, 
      maxDrawdownPrice: price, 
      timeframe: timeframe,
      note: body.note || `Alert for ${symbol}`,
      source: configData.name || "TradingView",
    };

    await addDoc(signalsRef, signalData);

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
