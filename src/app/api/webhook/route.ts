
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enhanced Ingestion Bridge
 * Handles TradingView alerts with robust parsing and system logging.
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
    const contentType = request.headers.get("content-type") || "";
    
    try {
      rawBody = await request.text();
      // Trim to handle accidental newlines from TradingView
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Invalid JSON format from TradingView",
        details: `Body: ${rawBody.substring(0, 100)}... Error: ${parseError.message}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Invalid JSON payload. Ensure NO extra text exists outside the {} braces." }, { status: 400 });
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
        details: `Expected match for ${configData.name}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Unauthorized: Invalid Secret Key" }, { status: 401 });
    }

    // 5. Broadcast Signal
    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: (body.symbol || body.ticker || body.asset || "UNKNOWN").toUpperCase(),
      type: (body.type || body.side || body.action || "NEUTRAL").toUpperCase(),
      note: body.note || body.message || body.comment || "Alert Ingested",
      source: configData.name || "Bridge"
    };

    await addDoc(signalsRef, signalData);

    // 6. Log Success
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: `Signal Ingested: ${signalData.symbol}`,
      details: `Source: ${configData.name}`,
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
