
import { NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc, query, where } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine with Self-Healing Logic.
 * Optimized for robustness and legacy data migration.
 */
export async function GET() {
  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch live prices from Binance
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

    // 2. Fetch signals. We fetch all to handle self-healing for signals missing the 'status' field.
    const signalsSnap = await getDocs(collection(firestore, "signals"));
    
    let totalInDb = signalsSnap.size;
    let activeCount = 0;
    let updateCount = 0;
    let stoppedCount = 0;
    let missingPriceCount = 0;
    let repairedCount = 0;
    const missingSymbols: string[] = [];
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      
      // SELF-HEALING: If status is missing (legacy data), treat as ACTIVE and update DB
      let currentStatus = signal.status;
      if (!currentStatus) {
        currentStatus = "ACTIVE";
        repairedCount++;
      }

      // Skip non-active signals
      if (currentStatus !== "ACTIVE") {
        continue;
      }

      activeCount++;
      const assetType = (signal.assetType || "").toUpperCase();

      // We only sync Crypto via Binance for now.
      if (assetType !== "CRYPTO" && !signal.symbol?.includes("USDT")) {
        continue;
      }

      const rawSymbol = signal.symbol || "";
      const base = rawSymbol.split(':').pop() || "";
      
      // Strip perpetual suffixes (.P, .PERP, etc) for Binance matching
      const cleanedSymbol = base
        .replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      
      let currentPrice = priceMap[cleanedSymbol];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'USDT'];
      if (!currentPrice) currentPrice = priceMap[cleanedSymbol + 'BUSD'];
      
      if (!currentPrice) {
        missingPriceCount++;
        missingSymbols.push(rawSymbol);
        // Even if price is missing, we update the status if we repaired it
        if (!signal.status) {
           await updateDoc(doc(firestore, "signals", signalDoc.id), { status: "ACTIVE" });
        }
        continue;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // Internal Invalidation Check
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
      await updateDoc(doc(firestore, "signals", signalDoc.id), {
        currentPrice: currentPrice,
        maxUpsidePrice: newMaxUpside,
        maxDrawdownPrice: newMaxDrawdown,
        status: newStatus,
        lastSyncAt: new Date().toISOString()
      });
    }

    // Comprehensive Heartbeat Log
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: (activeCount > 0 && updateCount === 0) ? "WARN" : "INFO",
      message: `Sync Node: ${updateCount}/${activeCount} UPDATED`,
      details: `Cycle Report: 
- Total Signals in Collection: ${totalInDb}
- Signals Repaired (Missing Status): ${repairedCount}
- Active Signals (Processed): ${activeCount}
- Successfully Updated: ${updateCount}
- Internal SL Triggered: ${stoppedCount}
- Prices Missing on Exchange: ${missingPriceCount}
${missingSymbols.length > 0 ? `\nSymbols failed: ${missingSymbols.slice(0, 10).join(", ")}${missingSymbols.length > 10 ? '...' : ''}` : ""}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      total: totalInDb,
      active: activeCount,
      updated: updateCount,
      repaired: repairedCount,
      stopped: stoppedCount
    });
  } catch (error: any) {
    console.error("[Sync Engine Error]", error);
    try {
        await addDoc(logsRef, {
            timestamp: new Date().toISOString(),
            level: "ERROR",
            message: "Sync Engine Fatal Error",
            details: error.message,
            webhookId: "SYSTEM_CRON",
        });
    } catch (e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
