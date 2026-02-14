
import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook Ingestion Endpoint
 * 
 * Example payload from TradingView:
 * {
 *   "symbol": "{{ticker}}",
 *   "action": "{{strategy.order.action}}",
 *   "price": "{{close}}",
 *   "time": "{{timenow}}",
 *   "id": "{{strategy.order.id}}"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Logic for handling the incoming signal:
    // 1. Validate the secret/token for security
    // 2. Persist the signal to a database (Firebase/Firestore)
    // 3. Trigger server-side alerts or automated trades
    
    console.log("Received Webhook Signal:", body);

    return NextResponse.json({ 
      success: true, 
      message: "Signal ingested by TezTerminal Antigravity",
      data: body 
    });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Failed to process signal" 
    }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "online", 
    service: "TezTerminal Webhook Listener" 
  });
}
