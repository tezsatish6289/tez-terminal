
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Webhook ingestion for TradingView alerts.
 * Expects a fixed JSON payload (from Pine script):
 *   ticker, side, exchange, timeframe, asset_type, note, price_at_alert, stopLoss, secretKey
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

    // Fixed payload schema from Pine: ticker, side, exchange, timeframe, asset_type, note, price_at_alert, stopLoss, secretKey
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

    const rawTf = String(body.timeframe ?? "15").toUpperCase().trim();
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
      status: "ACTIVE", // CRITICAL: This allows the Cron to see and sync the signal
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
