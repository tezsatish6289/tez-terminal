
import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine.
 * Fetches data from both Futures and Spot markets to ensure 100% symbol coverage.
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch from BOTH Futures and Spot to ensure no missing symbols
    const [futuresRes, spotRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v2/ticker/price", { cache: 'no-store' }),
      fetch("https://api.binance.com/api/v3/ticker/price", { cache: 'no-store' })
    ]);

    const priceMap: Record<string, number> = {};

    const processResults = async (res: Response) => {
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach((p: any) => {
            if (p.symbol && p.price) {
              priceMap[p.symbol.toUpperCase()] = parseFloat(p.price);
            }
          });
        }
      }
    };

    await Promise.all([processResults(futuresRes), processResults(spotRes)]);

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    let updateCount = 0;
    const missingSymbols: string[] = [];
    
    const updates = signalsSnap.docs.map(async (signalDoc) => {
      const signal = signalDoc.data();
      // Handle various symbol formats: BINANCE:BTCUSDT, BTC/USDT, etc.
      const rawSymbol = signal.symbol || "";
      const cleanedSymbol = rawSymbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
      
      const currentPrice = priceMap[cleanedSymbol];
      
      if (!currentPrice) {
        missingSymbols.push(rawSymbol);
        return;
      }

      if (!signal.price) return;

      const alertPrice = Number(signal.price);
      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      // BUY Logic: MaxUpside is Highest High, MaxDrawdown is Lowest Low
      if (signal.type === 'BUY') {
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown || newMaxDrawdown === 0) newMaxDrawdown = currentPrice;
      } 
      // SELL Logic: MaxUpside is Lowest Low, MaxDrawdown is Highest High
      else if (signal.type === 'SELL') {
        if (currentPrice < newMaxUpside || newMaxUpside === 0) newMaxUpside = currentPrice;
        if (currentPrice > newMaxDrawdown) newMaxDrawdown = currentPrice;
      }

      updateCount++;
      return updateDoc(doc(firestore, "signals", signalDoc.id), {
        currentPrice: currentPrice,
        maxUpsidePrice: newMaxUpside,
        maxDrawdownPrice: newMaxDrawdown
      });
    });

    await Promise.all(updates);

    // Audit Log for Debugger
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: missingSymbols.length > 0 ? "WARN" : "INFO",
      message: `Global Sync: ${updateCount} Success, ${missingSymbols.length} Missing`,
      details: missingSymbols.length > 0 
        ? `Updated ${updateCount} signals. Missing mapping for: ${Array.from(new Set(missingSymbols)).join(', ')}`
        : `Synchronized prices for all ${updateCount} active signals across Spot & Futures.`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      processed: signalsSnap.size,
      updated: updateCount,
      missing: missingSymbols.length
    });
  } catch (error: any) {
    console.error("[Cron Error]", error.message);
    try {
      await addDoc(logsRef, {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "Sync Engine Failure",
        details: error.message,
        webhookId: "SYSTEM_CRON",
      });
    } catch (e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
