import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Production-Ready Ingestion Bridge.
 * Fuzzy-searches for common TradingView JSON keys to ensure high compatibility.
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

    // Log attempt for debugging
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Incoming Webhook Attempt",
      details: `ID: ${webhookId} | Body: ${rawBody}`,
      webhookId,
    });

    if (webhookId === "MISSING_ID") {
      throw new Error("Missing 'id' parameter in Webhook URL.");
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`Invalid JSON format. Body: ${rawBody}`);
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

    // 1. FUZZY SYMBOL SEARCH
    const symbol = (body.ticker || body.symbol || body.pair || body.asset || "UNKNOWN").toUpperCase();

    // 2. FUZZY SIDE/TYPE SEARCH
    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.action || body.type || "").toString().toLowerCase();
    if (rawSide.includes("buy") || rawSide.includes("long")) signalType = "BUY";
    if (rawSide.includes("sell") || rawSide.includes("short")) signalType = "SELL";

    // 3. HARDENED FUZZY PRICE SEARCH
    // Check for common TradingView price keys
    const rawPrice = body.price ?? body.close ?? body.price_at_alert ?? body.last_price ?? body.entry ?? body.open;
    
    let price: number | null = null;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
      const parsed = parseFloat(rawPrice.toString());
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }
    
    // 4. FUZZY TIMEFRAME SEARCH & NORMALIZATION
    let rawTf = (body.timeframe || body.interval || body.tf || "").toString().toUpperCase().trim();
    
    const tfMap: Record<string, string> = {
      "1": "1", "1M": "1", "1MIN": "1", "1MINUTE": "1",
      "5": "5", "5M": "5", "5MIN": "5", "5MINUTE": "5",
      "15": "15", "15M": "15", "15MIN": "15", "15MINUTE": "15",
      "60": "60", "1H": "60", "1HOUR": "60", "H": "60",
      "240": "240", "4H": "240", "4HOUR": "240",
      "D": "D", "1D": "D", "DAILY": "D", "DAY": "D",
      "W": "W", "1W": "W", "WEEKLY": "W",
    };

    const cleanedTf = rawTf.replace(/[^A-Z0-9]/g, "");
    const timeframe = tfMap[cleanedTf] || cleanedTf || "15";

    const signalData = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol,
      type: signalType,
      price, // Stored as a strict number or null
      timeframe: timeframe.toString(),
      note: body.note || `Indicator alert for ${symbol}`,
      source: configData.name || "TradingView Indicator",
    };

    await addDoc(signalsRef, signalData);

    return NextResponse.json({ success: true, message: "Signal processed", timeframe, price });
  } catch (error: any) {
    console.error(`[Ingestion Error] ${error.message}`);
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

export async function GET() {
  return NextResponse.json({ status: "online" });
}
