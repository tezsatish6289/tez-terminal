
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Robust Ingestion Bridge for TradingView Indicators
 */
export async function POST(request: NextRequest) {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  const signalsRef = collection(firestore, "signals");
  
  const timestamp = new Date().toISOString();
  let rawBody = "";
  let webhookId = "";
  const userAgent = request.headers.get("user-agent") || "unknown";

  try {
    const { searchParams } = new URL(request.url);
    webhookId = searchParams.get("id") || "MISSING_ID";
    
    // 1. Capture Raw Request for Audit
    try {
      rawBody = await request.text();
    } catch (e) {
      rawBody = "UNREADABLE_BODY";
    }

    // Log the hit immediately
    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: "Webhook Hit Detected",
      details: `ID: ${webhookId} | UA: ${userAgent} | Body: ${rawBody.substring(0, 1000)}`,
      webhookId,
    });

    if (webhookId === "MISSING_ID") {
      throw new Error("Missing 'id' parameter in Webhook URL. URL should end with ?id=YOUR_BRIDGE_ID");
    }

    // 2. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch (parseError: any) {
      await addDoc(logsRef, {
        timestamp,
        level: "ERROR",
        message: "JSON Parse Error",
        details: `Raw Body: ${rawBody}. Ensure your TradingView message is valid JSON and has no trailing characters.`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
    }

    // 3. Validate Bridge Configuration
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      await addDoc(logsRef, {
        timestamp,
        level: "WARN",
        message: "Bridge ID Not Found",
        details: `The ID '${webhookId}' does not match any registered bridge.`,
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
        message: "Auth Failure: Key Mismatch",
        details: `Expected: ${configData.secretKey} | Received: ${providedKey}`,
        webhookId,
      });
      return NextResponse.json({ success: false, message: "Unauthorized: Invalid Secret Key" }, { status: 401 });
    }

    // 5. Signal Normalization (Handle "buy"/"sell" lowercase from Indicator)
    let signalType = "NEUTRAL";
    const rawSide = (body.side || body.type || body.action || "").toString().toUpperCase();
    
    if (rawSide.includes("BUY")) signalType = "BUY";
    if (rawSide.includes("SELL")) signalType = "SELL";

    const signalData = {
      webhookId: webhookId,
      receivedAt: timestamp,
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: (body.ticker || body.symbol || "UNKNOWN").toUpperCase(),
      type: signalType,
      note: body.note || body.comment || `Alert from ${configData.name}`,
      source: configData.name || "Bridge",
    };

    await addDoc(signalsRef, signalData);

    await addDoc(logsRef, {
      timestamp,
      level: "INFO",
      message: `Success: Signal Processed`,
      details: `${signalData.symbol} ${signalData.type} from ${userAgent}`,
      webhookId,
    });

    return NextResponse.json({ success: true, message: "Signal ingested" });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp,
      level: "ERROR",
      message: "Bridge Processing Error",
      details: error.message,
      webhookId: webhookId || "UNKNOWN",
    });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "online", info: "Submit POST requests to /api/webhook?id=YOUR_ID" });
}
