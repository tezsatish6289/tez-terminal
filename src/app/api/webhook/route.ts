
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enhanced Ingestion Bridge for TradingView Indicators.
 * Prioritizes indicator-specific fields like 'ticker' and 'side'.
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
    
    // 1. Capture Raw Request immediately
    try {
      rawBody = await request.text();
    } catch (e) {
      rawBody = "UNREADABLE_BODY";
    }

    // 2. Immediate Audit Log
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Webhook Hit Detected",
      details: `ID: ${webhookId} | Body: ${rawBody}`,
      webhookId,
    });

    if (webhookId === "MISSING_ID") {
      throw new Error("Missing 'id' parameter in URL. Format: /api/webhook?id=XYZ");
    }

    // 3. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`JSON Error: ${parseError.message}. Body: ${rawBody}`);
    }

    // 4. Validate Bridge Config
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      throw new Error(`Bridge ID '${webhookId}' not found.`);
    }

    const configData = configSnap.data();

    // 5. Auth Check
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error(`Auth Mismatch. Expected ${configData.secretKey}, got ${providedKey}`);
    }

    // 6. Signal Mapping
    // Handle your indicator's specific strings: "buy", "sell"
    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.type || body.action || "").toString().toLowerCase();
    
    if (rawSide.includes("buy")) signalType = "BUY";
    if (rawSide.includes("sell")) signalType = "SELL";

    const symbol = (body.ticker || body.symbol || "UNKNOWN").toUpperCase();

    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: rawBody,
      symbol: symbol,
      type: signalType,
      note: body.note || `Indicator alert for ${symbol}`,
      source: configData.name || "Indicator",
    };

    await addDoc(signalsRef, signalData);

    // Final Success Log
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Success: Signal Ingested",
      details: `Symbol: ${symbol} | Type: ${signalType}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested" });
  } catch (error: any) {
    console.error(`[Bridge Error] ${error.message}`);
    
    try {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Processing Failure",
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
