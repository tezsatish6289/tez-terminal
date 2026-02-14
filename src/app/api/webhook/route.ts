
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Global Ingestion Bridge
 * Receives alerts from TradingView and persists them to the global 'signals' stream.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("id");
    
    console.log(`[Ingestion] Incoming request for bridge: ${webhookId}`);

    if (!webhookId) {
      return NextResponse.json({ success: false, message: "Missing bridge ID" }, { status: 400 });
    }

    const body = await request.json();
    const { firestore } = initializeFirebase();

    // 1. Validate the bridge exists in the global collection
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      console.error(`[Ingestion] Bridge ${webhookId} not found in Firestore`);
      return NextResponse.json({ success: false, message: "Bridge configuration not found" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 2. Security: Validate Secret Key
    // TradingView alert must contain the secretKey matching the bridge config
    if (configData.secretKey && body.secretKey !== configData.secretKey) {
      console.warn(`[Ingestion] Unauthorized attempt on bridge ${webhookId}: Invalid Secret Key`);
      return NextResponse.json({ 
        success: false, 
        message: "Unauthorized: Invalid secret key" 
      }, { status: 401 });
    }

    // 3. Persist the Signal to the global shared feed
    const signalsRef = collection(firestore, "signals");
    
    const signalData = {
      webhookId: webhookId,
      receivedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: (body.symbol || body.ticker || "UNKNOWN").toUpperCase(),
      type: (body.type || body.side || body.action || "NEUTRAL").toUpperCase(),
      note: body.note || body.message || "Alert Ingested",
      source: configData.name || "Bridge"
    };

    await addDoc(signalsRef, signalData);

    console.log(`[Ingestion] Signal broadcasted for ${signalData.symbol} via ${configData.name}`);

    return NextResponse.json({ 
      success: true, 
      message: "Signal broadcasted to global stream",
      receivedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[Ingestion] Critical Error:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Ingestion Error: " + error.message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "active", service: "Antigravity Ingestion Node" });
}
