
import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("id");
    
    if (!webhookId) {
      return NextResponse.json({ success: false, message: "Missing webhook id" }, { status: 400 });
    }

    const body = await request.json();
    const { firestore } = initializeFirebase();

    // 1. Fetch the configuration to validate the secret key
    const configRef = doc(firestore, "webhooks", webhookId);
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
      return NextResponse.json({ success: false, message: "Webhook not found" }, { status: 404 });
    }

    const configData = configSnap.data();

    // 2. Validate Secret Key
    if (configData.secretKey && body.secretKey !== configData.secretKey) {
      return NextResponse.json({ 
        success: false, 
        message: "Unauthorized: Invalid secretKey" 
      }, { status: 401 });
    }

    // 3. Persist the Signal globally
    const signalsRef = collection(firestore, "signals");
    
    await addDoc(signalsRef, {
      webhookId: webhookId,
      receivedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
      payload: JSON.stringify(body),
      symbol: body.symbol || "UNKNOWN",
      type: body.type || "NEUTRAL",
      processingStatus: "PROCESSED"
    });

    return NextResponse.json({ 
      success: true, 
      message: "Signal recorded globally",
      receivedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      message: "Error: " + error.message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "online", service: "Global Ingestion Bridge" });
}
