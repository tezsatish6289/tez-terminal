
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enhanced Ingestion Bridge
 * Optimized for standard TradingView payloads and robust error logging.
 */
export async function POST(request: NextRequest) {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  const signalsRef = collection(firestore, "signals");
  
  const { searchParams } = new URL(request.url);
  const webhookId = searchParams.get("id");
  const timestamp = new Date().toISOString();

  let rawBody = "";

  try {
    // 1. Basic Validation
    if (!webhookId) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Missing bridge ID in request URL",
        details: "The webhook URL must end with ?id=YOUR_ID",
      });
      return NextResponse.json({ success: false, message: "Missing bridge ID" }, { status: 400 });
    }

    // 2. Parse Body (Handle TradingView's plain text or JSON)
    let body: any;
    try {
      rawBody = await request.text();
      // TradingView often sends extra whitespace or invisible characters
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Invalid JSON format from TradingView",
        details: `Raw Body: ${rawBody.substring(0, 500)}... Error: ${parseError.message}`,
        webhookId,
      });
      return NextResponse.json({ 
        success: false, 
        message: "Invalid JSON payload. Ensure NO extra text exists outside the {} braces." 
      }, { status: 400 });
    }

    // 3. Validate Bridge Configuration
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Bridge ID not found in database",
        details: `Requested ID: ${webhookId}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Bridge not found" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 4. Security: Secret Key Validation
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Unauthorized: Secret Key Mismatch",
        details: `Received: ${providedKey} | Source: ${configData.name}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Unauthorized: Invalid Secret Key" }, { status: 401 });
    }

    // 5. Broadcast Signal (Mapping common TradingView fields)
    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      // Map 'ticker' or 'symbol'
      symbol: (body.ticker || body.symbol || body.asset || "UNKNOWN").toUpperCase(),
      // Map 'side', 'type', 'action', or 'direction'
      type: (body.side || body.type || body.action || body.direction || "NEUTRAL").toUpperCase(),
      // Map descriptive notes
      note: body.note || body.message || body.comment || `Signal from ${configData.name}`,
      source: configData.name || "Bridge",
      // Store raw extra data for detail views
      meta: {
        price: body.trigger_price || body.price || null,
        exchange: body.exchange || null,
        timeframe: body.timeframe || null,
        currency: body.currency || null
      }
    };

    await addDoc(signalsRef, signalData);

    // 6. Log Success
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: `Signal Ingested: ${signalData.symbol}`,
      details: `Action: ${signalData.type} | Source: ${configData.name}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested" });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp,
      level: "ERROR",
      message: "Critical Ingestion Failure",
      details: error.message,
      webhookId: webhookId || "UNKNOWN",
    });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "active", service: "Antigravity Node" });
}
