import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

/**
 * Webhook Ingestion Endpoint
 * 
 * This route receives POST requests from TradingView.
 * It validates the secretKey and routes the signal to Firestore.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const configId = searchParams.get("id");
    
    if (!uid || !configId) {
      return NextResponse.json({ success: false, message: "Missing uid or configuration id" }, { status: 400 });
    }

    const body = await request.json();
    const { firestore } = initializeFirebase();

    // 1. Fetch the configuration to validate the secret key
    // Rules have been updated to allow GET on this specific path for ingestion.
    const configRef = doc(firestore, "users", uid, "webhookConfigurations", configId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      return NextResponse.json({ success: false, message: "Webhook configuration not found in TezTerminal" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 2. Validate Secret Key
    if (configData.secretKey && body.secretKey !== configData.secretKey) {
      return NextResponse.json({ 
        success: false, 
        message: "Unauthorized: Invalid or missing secretKey in JSON payload." 
      }, { status: 401 });
    }

    // 3. Persist the signal to Firestore
    const eventsRef = collection(firestore, "users", uid, "webhookEvents");
    
    await addDoc(eventsRef, {
      webhookConfigurationId: configId,
      receivedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      sourceIp: request.headers.get("x-forwarded-for") || "unknown",
      processingStatus: "PROCESSED",
      userId: uid
    });

    return NextResponse.json({ 
      success: true, 
      message: "Signal accepted by TezTerminal",
      received: {
        id: configId,
        time: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error("Webhook Ingestion Error:", error);
    return NextResponse.json({ 
      success: false, 
      message: "TezTerminal Bridge Error: " + error.message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "online", 
    service: "TezTerminal Webhook Bridge" 
  });
}