
import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine.
 * Enhanced matching logic to handle Perpetual suffixes (.P, .PERP, _PERP).
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch from BOTH Futures and Spot
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
    const skippedAssets: string[] = [];
    
    const updates = signalsSnap.docs.map(async (signalDoc) => {
      const signal = signalDoc.data();
      const assetType = (signal.assetType || "").toUpperCase();

      // Only sync Crypto via Binance.
      if (assetType !== "CRYPTO" && !signal.symbol?.includes("USDT")) {
        skippedAssets.push(signal.symbol || "UNKNOWN");
        return;
      }

      const rawSymbol = signal.symbol || "";
      // Strip common exchange suffixes and perpetual markers
      const base = rawSymbol.split(':').pop() || "";
      const cleanedSymbol = base
        .replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      
      // Multi-layer matching: Direct -> +USDT -> +BUSD
      let currentPrice = priceMap[cleanedSymbol];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'USDT'];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'BUSD'];
      
      if (!currentPrice) {
        missingSymbols.push(rawSymbol);
        return;
      }

      if (!signal.price) return;

      const alertPrice = Number(signal.price);
      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      if (signal.type === 'BUY') {
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown || newMaxDrawdown === 0) newMaxDrawdown = currentPrice;
      } else if (signal.type === 'SELL') {
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

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: missingSymbols.length > 0 ? "WARN" : "INFO",
      message: `Sync Heartbeat: ${updateCount} Updated`,
      details: `Processed ${updateCount} signals. ${missingSymbols.length} missing mapping. Missing: ${missingSymbols.join(', ')}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      updated: updateCount,
      missing: missingSymbols.length
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
