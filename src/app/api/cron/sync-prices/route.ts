
import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

/**
 * 24/7 Performance Engine.
 * Intended to be triggered every 5 minutes by an external scheduler.
 * Updates high/low watermarks for all active signals.
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  
  try {
    // 1. Fetch current Binance prices (One call for all pairs)
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

    // 2. Fetch all signals to evaluate performance
    const signalsSnap = await getDocs(collection(firestore, "signals"));
    
    const updates = signalsSnap.docs.map(async (signalDoc) => {
      const signal = signalDoc.data();
      const symbol = signal.symbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
      const currentPrice = priceMap[symbol];
      
      if (!currentPrice || !signal.price) return;

      const alertPrice = Number(signal.price);
      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      if (signal.type === 'BUY') {
        // Upside = High, Drawdown = Low
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown) newMaxDrawdown = currentPrice;
      } else if (signal.type === 'SELL') {
        // Upside = Low, Drawdown = High
        if (currentPrice < newMaxUpside || newMaxUpside === 0) newMaxUpside = currentPrice;
        if (currentPrice > newMaxDrawdown) newMaxDrawdown = currentPrice;
      }

      // 3. Persist new records to DB if performance improved or dipped
      if (newMaxUpside !== signal.maxUpsidePrice || newMaxDrawdown !== signal.maxDrawdownPrice) {
        return updateDoc(doc(firestore, "signals", signalDoc.id), {
          maxUpsidePrice: newMaxUpside,
          maxDrawdownPrice: newMaxDrawdown
        });
      }
    });

    await Promise.all(updates);

    return NextResponse.json({ 
      success: true, 
      processed: signalsSnap.size,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[Cron Error]", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
