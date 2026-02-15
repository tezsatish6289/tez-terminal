import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Production-Ready Ingestion Bridge.
 * Optimized for external TradingView signals.
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
    
    // 1. Capture Raw Request immediately for debugging
    try {
      rawBody = await request.text();
    } catch (e) {
      rawBody = "UNREADABLE_BODY";
    }

    // 2. Audit Log (Helpful during initial deployment setup)
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

    // 3. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`Invalid JSON format. Body: ${rawBody}`);
    }

    // 4. Validate Bridge Config
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      throw new Error(`Bridge ID '${webhookId}' not found in terminal registry.`);
    }

    const configData = configSnap.data();

    // 5. Auth Check
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error(`Authentication failure: Secret key mismatch.`);
    }

    // 6. Signal Mapping
    let signalType = "NEUTRAL";
    const rawSide = (body.side || "").toString().toLowerCase();
    
    if (rawSide === "buy") signalType = "BUY";
    if (rawSide === "sell") signalType = "SELL";

    const symbol = (body.ticker || body.symbol || "UNKNOWN").toUpperCase();
    
    // Support both 'price_at_alert' and 'price' for backward compatibility
    const rawPrice = body.price_at_alert ?? body.price;
    const price = rawPrice ? parseFloat(rawPrice.toString()) : null;

    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: rawBody,
      symbol: symbol,
      type: signalType,
      price: price,
      note: body.note || `Indicator alert for ${symbol}`,
      source: configData.name || "TradingView Indicator",
    };

    // Save to global signal stream
    await addDoc(signalsRef, signalData);

    // Final Success Log
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Signal Processed Successfully",
      details: `Asset: ${symbol} | Action: ${signalType} | Price: ${price || 'N/A'}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal processed" });
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
    } catch (logErr) {
      // Silent catch
    }

    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "online", 
    message: "Endpoint ready for TradingView POST requests.",
    example: "/api/webhook?id=YOUR_BRIDGE_ID"
  });
}