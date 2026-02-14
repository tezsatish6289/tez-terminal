
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enhanced Ingestion Bridge with verbose logging
 */
export async function POST(request: NextRequest) {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  const signalsRef = collection(firestore, "signals");
  
  const timestamp = new Date().toISOString();
  let rawBody = "";
  let webhookId = "";

  try {
    const { searchParams } = new URL(request.url);
    webhookId = searchParams.get("id") || "MISSING_ID";
    
    // 1. Log the absolute beginning of the request
    rawBody = await request.text();
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Webhook Request Received",
      details: `ID from URL: ${webhookId} | Body Length: ${rawBody.length} characters`,
      webhookId,
    });

    if (webhookId === "MISSING_ID") {
      throw new Error("The webhook URL is missing the ?id= parameter. Check your TradingView settings.");
    }

    // 2. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "JSON Parse Failure",
        details: `Raw Body: ${rawBody.substring(0, 500)}... Ensure no extra text exists in TradingView message.`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
    }

    // 3. Validate Bridge Configuration
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Bridge ID Not Found",
        details: `The ID ${webhookId} does not match any active bridge in your dashboard.`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Bridge not found" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 4. Secret Key Validation
    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Unauthorized: Invalid Secret Key",
        details: `Expected: ${configData.secretKey} | Received: ${providedKey}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Invalid Key" }, { status: 401 });
    }

    // 5. Ingest Signal
    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: (body.ticker || body.symbol || "UNKNOWN").toUpperCase(),
      type: (body.side || body.type || body.action || "NEUTRAL").toUpperCase(),
      note: body.note || body.comment || `TradingView Alert from ${configData.name}`,
      source: configData.name || "Bridge",
    };

    await addDoc(signalsRef, signalData);

    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: `Success: Signal Ingested (${signalData.symbol})`,
      details: `Action: ${signalData.type} | ID: ${webhookId}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested" });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp,
      level: "ERROR",
      message: "Critical Bridge Failure",
      details: error.message,
      webhookId: webhookId || "UNKNOWN",
    });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "active" });
}
