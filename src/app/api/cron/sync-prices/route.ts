import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc, query, where } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine with Multi-Endpoint Support (Spot + Futures).
 * Hardened for production environments and aggressive ticker matching.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  
  const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024"; 

  if (key !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid or missing sync key." }, { status: 401 });
  }

  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch live prices from BOTH Binance Futures and Spot
    const [futuresRes, spotRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v2/ticker/price", { next: { revalidate: 0 } }),
      fetch("https://api.binance.com/api/v3/ticker/price", { next: { revalidate: 0 } })
    ]);

    const priceMap: Record<string, number> = {};
    let futuresCount = 0;
    let spotCount = 0;
    
    const processResults = async (res: Response, label: string) => {
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach((p: any) => {
            if (p.symbol && p.price) {
              const sym = p.symbol.toUpperCase();
              const val = parseFloat(p.price);
              // Store symbols in map. Futures take priority for Perpetual trackers.
              priceMap[sym] = val;
              if (label === 'futures') futuresCount++; else spotCount++;
            }
          });
        }
      } else {
        console.error(`[Sync] ${label} fetch failed: ${res.status}`);
      }
    };

    await Promise.all([
      processResults(futuresRes, 'futures'),
      processResults(spotRes, 'spot')
    ]);

    // 2. Fetch all signals for processing
    const signalsSnap = await getDocs(collection(firestore, "signals"));
    
    let activeCount = 0;
    let updateCount = 0;
    let stoppedCount = 0;
    let failedSymbols: string[] = [];
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      
      // Self-healing: treat signals without status as ACTIVE
      const currentStatus = signal.status || "ACTIVE";
      if (currentStatus !== "ACTIVE") continue;

      activeCount++;
      const rawSymbol = (signal.symbol || "").toUpperCase();
      
      // ADVANCED CLEANING: Handle BINANCE:BTCUSDT.P, XAUUSD.P, etc.
      let base = rawSymbol.split(':').pop() || ""; 
      
      // Variations to try
      const variations = [
        base,                                      // Original (e.g., BTCUSDT.P)
        base.replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, ''), // No suffix (e.g., BTCUSDT)
        base.replace(/[^A-Z0-9]/g, ''),            // Only Alpha-numeric
      ];

      let currentPrice = 0;
      for (const v of variations) {
        const upperV = v.toUpperCase();
        if (priceMap[upperV]) {
          currentPrice = priceMap[upperV];
          break;
        }
        // Try adding USDT if missing (e.g., for BTC signals)
        if (priceMap[upperV + 'USDT']) {
          currentPrice = priceMap[upperV + 'USDT'];
          break;
        }
      }
      
      if (!currentPrice || isNaN(currentPrice)) {
        failedSymbols.push(rawSymbol);
        continue;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // Internal Stop Loss logic
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

    const logMessage = `24/7 SYNC: ${updateCount}/${activeCount} UPDATED`;
    const logDetails = `Cycle Report:
- Active Tracked: ${activeCount}
- Prices Updated: ${updateCount}
- Retired (Hit SL): ${stoppedCount}
- Exchange Feed: ${spotCount} Spot, ${futuresCount} Futures
- Failed Tickers: ${failedSymbols.length}
${failedSymbols.length > 0 ? `Failed: ${failedSymbols.slice(0, 10).join(', ')}` : ''}`;

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: logMessage,
      details: logDetails,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      updated: updateCount, 
      active: activeCount,
      exchangeData: { spot: spotCount, futures: futuresCount } 
    });
  } catch (error: any) {
    console.error("[Sync Error]", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
