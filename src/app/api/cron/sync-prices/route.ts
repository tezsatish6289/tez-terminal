import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine with Multi-Endpoint Support (Spot + Futures).
 * Requires ?key= query parameter to prevent unauthorized execution.
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
    // 1. Fetch live prices from BOTH Binance Futures and Spot to ensure maximum coverage
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
      let cleaned = rawSymbol
        .split(':').pop() || ""; // Remove exchange prefix
      
      cleaned = cleaned
        .replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, '') // Remove Perpetual suffixes
        .replace(/[^A-Z0-9]/g, ''); // Remove any special characters

      // Try matching the symbol as provided, or with USDT appended if it's a base asset
      let currentPrice = priceMap[cleaned];
      if (!currentPrice) currentPrice = priceMap[cleaned + 'USDT'];
      
      if (!currentPrice) {
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
- Failed Tickers: ${failedSymbols.length}
${failedSymbols.length > 0 ? `Failed: ${failedSymbols.slice(0, 10).join(', ')}` : ''}`;

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: logMessage,
      details: logDetails,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, active: activeCount });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
