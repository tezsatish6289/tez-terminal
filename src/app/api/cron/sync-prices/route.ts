import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * 24/7 Global Synchronization Engine with Security Hardening and Smart Symbol Matching.
 * Requires ?key= query parameter to prevent unauthorized execution.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  
  // Security Check: Ensure only authorized cron services can trigger the sync
  const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024"; 

  if (key !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid or missing sync key." }, { status: 401 });
  }

  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // 1. Fetch live prices from Binance (Futures first for .P signals, then Spot)
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
      } else {
        console.error(`Binance fetch failed with status: ${res.status}`);
      }
    };

    await Promise.all([processResults(futuresRes), processResults(spotRes)]);

    // 2. Fetch all signals for processing
    const signalsSnap = await getDocs(collection(firestore, "signals"));
    
    let totalInDb = signalsSnap.size;
    let activeCount = 0;
    let updateCount = 0;
    let stoppedCount = 0;
    let repairedCount = 0;
    let failedSymbols: string[] = [];
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      
      // SELF-HEALING: If status is missing, treat as ACTIVE
      let currentStatus = signal.status;
      if (!currentStatus) {
        currentStatus = "ACTIVE";
        repairedCount++;
      }

      if (currentStatus !== "ACTIVE") continue;

      activeCount++;
      const rawSymbol = (signal.symbol || "").toUpperCase();
      
      // SMART CLEANING LOGIC
      // 1. Get the base symbol (Handle BINANCE:BTCUSDT)
      let base = rawSymbol.split(':').pop() || "";
      
      // 2. Remove Perp suffixes (.P, .PERP, _PERP, -PERP)
      base = base.replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, '');
      
      // 3. Remove all non-alphanumeric except maybe the symbol itself
      const cleaned = base.replace(/[^A-Z0-9]/g, '');

      // 4. Try matching permutations
      let currentPrice = priceMap[cleaned]; // e.g. POWRUSDT
      if (!currentPrice) currentPrice = priceMap[cleaned + 'USDT']; // e.g. POWR -> POWRUSDT
      if (!currentPrice) currentPrice = priceMap[cleaned + 'BUSD'];
      
      // Special check for Indian/US stocks if they were accidentally matched to Binance (not supported yet)
      if (!currentPrice) {
        failedSymbols.push(rawSymbol);
        // We still update the status in the DB if it was missing to avoid infinite "repaired" logs
        if (!signal.status) {
           await updateDoc(doc(firestore, "signals", signalDoc.id), { status: "ACTIVE" });
        }
        continue;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // INTERNAL STOP LOSS CHECK
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

    const logMessage = `24/7 SYNC SUCCESS: ${updateCount}/${activeCount} UPDATED`;
    const logDetails = `Cycle Report: 
- Total Collection: ${totalInDb}
- Repaired (Missing Status): ${repairedCount}
- Active & Tracked: ${activeCount}
- Prices Found: ${updateCount}
- Retired (Hit SL): ${stoppedCount}
- Tickers Missing: ${failedSymbols.length}
${failedSymbols.length > 0 ? `\nFailed Tickers: ${failedSymbols.slice(0, 15).join(', ')}${failedSymbols.length > 15 ? '...' : ''}` : ''}`;

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: (activeCount > 0 && updateCount === 0) ? "WARN" : "INFO",
      message: logMessage,
      details: logDetails,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      total: totalInDb,
      active: activeCount,
      updated: updateCount,
      repaired: repairedCount,
      stopped: stoppedCount,
      missing: failedSymbols.length
    });
  } catch (error: any) {
    console.error("Cron Sync Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
