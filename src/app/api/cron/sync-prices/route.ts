import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

/**
 * CRITICAL: Force dynamic ensures Next.js does not cache the response of this API route.
 * Explicitly setting revalidate to 0 to prevent any stale data being served to the cron.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const userAgent = request.headers.get("user-agent") || "";
  const isCron = userAgent.toLowerCase().includes("cron") || userAgent.toLowerCase().includes("job");
  
  const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024"; 

  if (key !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  try {
    // Mimic a real browser to prevent exchange WAF from blocking automated hits
    const fetchOptions: RequestInit = {
      cache: 'no-store',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    const [futuresRes, spotRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v2/ticker/price", fetchOptions),
      fetch("https://api.binance.com/api/v3/ticker/price", fetchOptions)
    ]);

    const priceMap: Record<string, number> = {};
    let futuresCount = 0;
    let spotCount = 0;
    let errorLog = "";
    
    const processResults = async (res: Response, label: string) => {
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach((p: any) => {
            if (p.symbol && p.price) {
              const sym = p.symbol.toUpperCase();
              priceMap[sym] = parseFloat(p.price);
              if (label === 'futures') futuresCount++; else spotCount++;
            }
          });
        }
      } else {
        errorLog += `${label.toUpperCase()} API returned ${res.status} ${res.statusText}. `;
      }
    };

    await Promise.all([
      processResults(futuresRes, 'futures'),
      processResults(spotRes, 'spot')
    ]);

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    
    let activeInDB = 0;
    let updateCount = 0;
    let stoppedCount = 0;
    let failedSymbols: string[] = [];
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      const currentStatus = signal.status || "ACTIVE";
      
      if (currentStatus !== "ACTIVE") continue;
      activeInDB++;

      const rawSymbol = (signal.symbol || "").toUpperCase();
      let base = rawSymbol.split(':').pop() || ""; 
      
      const variations = [
        base,
        base.replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, ''),
        base.replace(/[^A-Z0-9]/g, ''),
        base + "USDT"
      ];

      let currentPrice = 0;
      for (const v of variations) {
        if (priceMap[v.toUpperCase()]) {
          currentPrice = priceMap[v.toUpperCase()];
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

      if (stopLoss > 0) {
        if (signal.type === 'BUY' && currentPrice <= stopLoss) newStatus = "INACTIVE";
        else if (signal.type === 'SELL' && currentPrice >= stopLoss) newStatus = "INACTIVE";
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

    const logMessage = `24/7 SYNC: ${updateCount}/${activeInDB} UPDATED`;
    const logDetails = `Source: ${isCron ? 'AUTOMATED CRON' : 'MANUAL TRIGGER'}
- Exchange Feed: ${futuresCount} Futures, ${spotCount} Spot
- Signals in DB: ${signalsSnap.size}
- Active Filtered: ${activeInDB}
- Successfully Synced: ${updateCount}
${errorLog ? `- ERRORS: ${errorLog}` : ''}
${failedSymbols.length > 0 ? `- Missing Tickers: ${failedSymbols.slice(0, 10).join(', ')}` : ''}`;

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: errorLog ? "WARN" : "INFO",
      message: logMessage,
      details: logDetails,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ 
      success: true, 
      updated: updateCount, 
      feed: { futures: futuresCount, spot: spotCount },
      isCron 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
