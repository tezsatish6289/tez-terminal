import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * 24/7 Performance Engine.
 * Intended to be triggered every 5 minutes.
 * Updates high/low watermarks for all active signals.
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    const priceRes = await fetch("https://fapi.binance.com/fapi/v2/ticker/price", { cache: 'no-store' });
    if (!priceRes.ok) throw new Error("Failed to fetch prices from Binance");
    
    const prices = await priceRes.json();
    const priceMap: Record<string, number> = {};
    if (Array.isArray(prices)) {
      prices.forEach((p: any) => { 
        if (p.symbol && p.price) {
          priceMap[p.symbol] = parseFloat(p.price); 
        }
      });
    }

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    let updateCount = 0;
    
    const updates = signalsSnap.docs.map(async (signalDoc) => {
      const signal = signalDoc.data();
      const symbol = signal.symbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
      const currentPrice = priceMap[symbol];
      
      if (!currentPrice || !signal.price) return;

      const alertPrice = Number(signal.price);
      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      if (signal.type === 'BUY') {
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown) newMaxDrawdown = currentPrice;
      } else if (signal.type === 'SELL') {
        if (currentPrice < newMaxUpside || newMaxUpside === 0) newMaxUpside = currentPrice;
        if (currentPrice > newMaxDrawdown) newMaxDrawdown = currentPrice;
      }

      if (newMaxUpside !== signal.maxUpsidePrice || newMaxDrawdown !== signal.maxDrawdownPrice) {
        updateCount++;
        return updateDoc(doc(firestore, "signals", signalDoc.id), {
          maxUpsidePrice: newMaxUpside,
          maxDrawdownPrice: newMaxDrawdown
        });
      }
    });

    await Promise.all(updates);

    // Technical Log for Admin Debugger
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: "Cron Heartbeat: Performance Sync Complete",
      details: `Processed ${signalsSnap.size} signals. Records updated: ${updateCount}.`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      processed: signalsSnap.size,
      updated: updateCount
    });
  } catch (error: any) {
    console.error("[Cron Error]", error.message);
    try {
      await addDoc(logsRef, {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "Cron Failure: Sync Interrupted",
        details: error.message,
        webhookId: "SYSTEM_CRON",
      });
    } catch (e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
