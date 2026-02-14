import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enhanced Ingestion Bridge for TradingView Indicators
 * Supports direct "buy"/"sell" strings and robust error logging.
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
    
    // 1. Capture Raw Request for Audit
    try {
      rawBody = await request.text();
    } catch (e) {
      rawBody = "UNREADABLE_BODY";
    }

    // Server-side log for immediate visibility in platform logs
    console.log(`[Webhook Hit] ID: ${webhookId} | Body: ${rawBody}`);

    // 2. Immediate Audit Log to Firestore
    // This happens before any validation to ensure we see the "hit"
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Webhook Request Detected",
      details: `ID: ${webhookId} | Body: ${rawBody.substring(0, 1000)}`,
      webhookId,
    });

    if (webhookId === "MISSING_ID") {
      throw new Error("Missing 'id' parameter in Webhook URL. URL should end with ?id=YOUR_BRIDGE_ID");
    }

    // 3. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      throw new Error(`Invalid JSON: ${parseError.message}. Body: ${rawBody}`);
    }

    // 4. Validate Bridge Configuration
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      throw new Error(`Bridge ID '${webhookId}' does not exist in the database.`);
    }

    const configData = configSnap.data();

    // 5. Secret Key Validation
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error("Authentication Failed: Secret Key Mismatch.");
    }

    // 6. Signal Normalization
    // Prioritize fields from your indicator: ticker, side
    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.type || body.action || "").toString().toUpperCase();
    
    if (rawSide.includes("BUY")) signalType = "BUY";
    if (rawSide.includes("SELL")) signalType = "SELL";

    const symbol = (body.ticker || body.symbol || "UNKNOWN").toUpperCase();

    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: symbol,
      type: signalType,
      note: body.note || body.comment || `Alert from ${configData.name}`,
      source: configData.name || "Bridge",
    };

    await addDoc(signalsRef, signalData);

    // Success Log
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Success: Signal Ingested",
      details: `Symbol: ${symbol} | Side: ${signalType}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested successfully" });
  } catch (error: any) {
    console.error(`[Webhook Error] ${error.message}`);
    
    // Attempt to log the error to Firestore for the user to see in History
    try {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Ingestion Failure",
        details: error.message,
        webhookId: webhookId || "UNKNOWN",
      });
    } catch (logErr) {
      console.error("Critical: Failed to write error log to Firestore", logErr);
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
