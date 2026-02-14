
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

  try {
    // 1. Basic Validation
    if (!webhookId) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Missing webhook ID in request URL",
        details: "Expected ?id=...",
      });
      return NextResponse.json({ success: false, message: "Missing bridge ID" }, { status: 400 });
    }

    // 2. Parse Body (Handle TradingView's plain text or JSON)
    let body: any;
    const contentType = request.headers.get("content-type") || "";
    
    try {
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else {
        const text = await request.text();
        body = JSON.parse(text);
      }
    } catch (parseError: any) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "Failed to parse request body as JSON",
        details: parseError.message,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    // 3. Validate Bridge Configuration
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Bridge ID not found in database",
        details: `ID: ${webhookId}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Bridge not found" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 4. Security: Secret Key Validation
    // TradingView alert must contain the secretKey
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Unauthorized attempt: Invalid Secret Key",
        details: `Provided: ${providedKey}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
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
      message: `Signal Ingested: ${signalData.symbol} ${signalData.type}`,
      details: `Source: ${configData.name}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested" });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp,
      level: "ERROR",
      message: "Critical Ingestion Error",
      details: error.message,
      webhookId: webhookId || "UNKNOWN",
    });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "active", service: "Antigravity Node" });
}
