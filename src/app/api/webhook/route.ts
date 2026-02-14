import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Webhook Ingestion Endpoint
 * 
 * This route receives POST requests from TradingView.
 * It uses the 'uid' and 'id' (configId) from the query string to route
 * the signal to the correct user's Firestore collection.
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

    // Persist the signal to Firestore
    // Path: /users/{userId}/webhookEvents
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
      message: "Signal ingested by TezTerminal Antigravity",
      received: body 
    });
  } catch (error: any) {
    console.error("Webhook Ingestion Error:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Failed to process signal",
      error: error.message 
    }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "online", 
    service: "TezTerminal Webhook Listener" 
  });
}
