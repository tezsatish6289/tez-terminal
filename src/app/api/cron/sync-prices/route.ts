
import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc, query, where } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine.
 * Optimized to only track ACTIVE signals and handle internal Stop Loss logic.
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch from BOTH Futures and Spot to maximize coverage
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

    // 2. Query ONLY active signals to optimize performance
    const signalsQuery = query(collection(firestore, "signals"), where("status", "==", "ACTIVE"));
    const signalsSnap = await getDocs(signalsQuery);
    
    let updateCount = 0;
    let stoppedCount = 0;
    const missingSymbols: string[] = [];
    
    const updates = signalsSnap.docs.map(async (signalDoc) => {
      const signal = signalDoc.data();
      const assetType = (signal.assetType || "").toUpperCase();

      // Only sync Crypto via Binance for now.
      if (assetType !== "CRYPTO" && !signal.symbol?.includes("USDT")) {
        return;
      }

      const rawSymbol = signal.symbol || "";
      const base = rawSymbol.split(':').pop() || "";
      const cleanedSymbol = base
        .replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      
      let currentPrice = priceMap[cleanedSymbol];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'USDT'];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'BUSD'];
      
      if (!currentPrice) {
        missingSymbols.push(rawSymbol);
        return;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // 3. Internal Invalidation Check (Lifecycle Management)
      if (stopLoss > 0) {
        if (signal.type === 'BUY' && currentPrice <= stopLoss) {
          newStatus = "INACTIVE";
        } else if (signal.type === 'SELL' && currentPrice >= stopLoss) {
          newStatus = "INACTIVE";
        }
      }

      if (newStatus === "INACTIVE") stoppedCount++;

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
        maxDrawdownPrice: newMaxDrawdown,
        status: newStatus
      });
    });

    await Promise.all(updates);

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: missingSymbols.length > 0 ? "WARN" : "INFO",
      message: `Sync Heartbeat: ${updateCount} Updated, ${stoppedCount} Stopped`,
      details: `Processed ${updateCount} active signals. ${stoppedCount} reached stop loss. ${missingSymbols.length} missing mapping.`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      updated: updateCount,
      stopped: stoppedCount,
      missing: missingSymbols.length
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
