import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 24/7 PERFORMANCE SYNC ENGINE - AGGRESSIVE MIRROR ROTATION
 * Optimized to bypass US (451) blocks by cycling through global mirrors with browser headers.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024"; 

  if (key !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { firestore } = initializeFirebase();
  const logsRef = collection(firestore, "logs");
  
  // SEQUENTIAL GLOBAL MIRRORS (Non-US targeted mirrors often have different WAF rules)
  const spotMirrors = [
    "https://api.binance.me",
    "https://api3.binance.com",
    "https://api2.binance.com",
    "https://api1.binance.com",
    "https://api.binance.com",
    "https://data-api.binance.vision"
  ];

  const futuresMirrors = [
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com"
  ];

  try {
    const fetchOptions: RequestInit = {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.binance.com/',
        'Origin': 'https://www.binance.com',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    let priceMap: Record<string, number> = {};
    let mirrorStatusLog = "";
    let successfulMirror = "NONE";

    const fetchWithFallback = async (mirrors: string[], endpoint: string) => {
      for (const baseUrl of mirrors) {
        try {
          const res = await fetch(`${baseUrl}${endpoint}?_t=${Date.now()}`, fetchOptions);
          const statusPrefix = baseUrl.split('//')[1].split('.')[0];
          
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              successfulMirror = baseUrl;
              return { data, source: baseUrl };
            }
          }
          mirrorStatusLog += `[${statusPrefix}: ${res.status}] `;
        } catch (e: any) {
          mirrorStatusLog += `[MIRROR_ERR: ${e.message.slice(0,10)}] `;
        }
      }
      return null;
    };

    const [futuresResult, spotResult] = await Promise.all([
      fetchWithFallback(futuresMirrors, "/fapi/v2/ticker/price"),
      fetchWithFallback(spotMirrors, "/api/v3/ticker/price")
    ]);

    if (!futuresResult && !spotResult) {
      throw new Error(`CRITICAL: All Global Binance mirrors blocked (451). Mirrors attempted: ${mirrorStatusLog}`);
    }

    const allPrices = [...(futuresResult?.data || []), ...(spotResult?.data || [])];
    allPrices.forEach((p: any) => {
      if (p.symbol && p.price) {
        priceMap[p.symbol.toUpperCase()] = parseFloat(p.price);
      }
    });

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    let updateCount = 0;
    let stoppedCount = 0;
    let failedTickers: string[] = [];
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;

      const rawSymbol = (signal.symbol || "").toUpperCase();
      let base = rawSymbol.split(':').pop() || ""; 
      const symbolVariations = [
        base,
        base.replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, ''),
        base + "USDT",
        base.replace("USDT", "")
      ];

      let currentPrice = 0;
      for (const v of symbolVariations) {
        if (priceMap[v.toUpperCase()]) {
          currentPrice = priceMap[v.toUpperCase()];
          break;
        }
      }
      
      if (!currentPrice) {
        failedTickers.push(base);
        continue;
      }

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      if (stopLoss > 0) {
        if (signal.type === 'BUY' && currentPrice <= stopLoss) newStatus = "INACTIVE";
        else if (signal.type === 'SELL' && currentPrice >= stopLoss) newStatus = "INACTIVE";
        if (newStatus === "INACTIVE") stoppedCount++;
      }

      let newMaxUpside = signal.maxUpsidePrice || alertPrice;
      let newMaxDrawdown = signal.maxDrawdownPrice || alertPrice;

      if (signal.type === 'BUY') {
        if (currentPrice > newMaxUpside) newMaxUpside = currentPrice;
        if (currentPrice < newMaxDrawdown || newMaxDrawdown === 0) newMaxDrawdown = currentPrice;
      } else {
        if (currentPrice < newMaxUpside || newMaxUpside === 0) newMaxUpside = currentPrice;
        if (currentPrice > newMaxDrawdown) newMaxDrawdown = currentPrice;
      }

      await updateDoc(doc(firestore, "signals", signalDoc.id), {
        currentPrice: currentPrice,
        maxUpsidePrice: newMaxUpside,
        maxDrawdownPrice: newMaxDrawdown,
        status: newStatus,
        lastSyncAt: new Date().toISOString()
      });
      updateCount++;
    }

    const source = request.headers.get("user-agent")?.includes("cron") ? "CRON_SERVICE" : "MANUAL_TRIGGER";

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `24/7 SYNC: ${updateCount} UPDATED`,
      details: `Source: ${source}\nActive Mirror: ${successfulMirror}\nUpdated: ${updateCount}\nStopped: ${stoppedCount}\nMirror Audit: ${mirrorStatusLog}\nFailed Tickers: ${failedTickers.slice(0,10).join(', ')}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, stopped: stoppedCount });
  } catch (error: any) {
    const source = request.headers.get("user-agent")?.includes("cron") ? "CRON_SERVICE" : "MANUAL_TRIGGER";
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Sync Failure - Mirror Exhaustion",
      details: `Source: ${source}\nError: ${error.message}`,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
