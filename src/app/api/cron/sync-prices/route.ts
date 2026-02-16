import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 24/7 PERFORMANCE SYNC ENGINE - GLOBAL BINANCE MIRROR STRATEGY
 * Priority: Binance Global (Rest of World)
 * Targeted to bypass 451 blocks by cycling through Global mirrors.
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
  
  // SEQUENTIAL MIRRORS FOR BINANCE GLOBAL (NOT US)
  // api.binance.me is a primary circumvention mirror for global access.
  const spotMirrors = [
    "https://api.binance.me",
    "https://api3.binance.com",
    "https://api2.binance.com",
    "https://api1.binance.com",
    "https://api.binance.com"
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
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.binance.com/',
      }
    };

    let priceMap: Record<string, number> = {};
    let mirrorStatusLog = "";

    // Sequential Fallback Fetcher for Global Data
    const fetchWithFallback = async (mirrors: string[], endpoint: string) => {
      for (const baseUrl of mirrors) {
        try {
          const res = await fetch(`${baseUrl}${endpoint}`, fetchOptions);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return { data, source: baseUrl };
          }
          mirrorStatusLog += `[${baseUrl.split('//')[1]}: ${res.status}] `;
        } catch (e) {
          mirrorStatusLog += `[${baseUrl.split('//')[1]}: ERR] `;
        }
      }
      return null;
    };

    const [futuresResult, spotResult] = await Promise.all([
      fetchWithFallback(futuresMirrors, "/fapi/v2/ticker/price"),
      fetchWithFallback(spotMirrors, "/api/v3/ticker/price")
    ]);

    if (!futuresResult && !spotResult) {
      throw new Error(`CRITICAL: All Global Binance mirrors blocked (451/WAF). Status: ${mirrorStatusLog}`);
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
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;

      const rawSymbol = (signal.symbol || "").toUpperCase();
      let base = rawSymbol.split(':').pop() || ""; 
      const symbolVariations = [
        base,
        base.replace(/\.P$|\.PERP$|_PERP$|-PERP$/i, ''),
        base + "USDT"
      ];

      let currentPrice = 0;
      for (const v of symbolVariations) {
        if (priceMap[v.toUpperCase()]) {
          currentPrice = priceMap[v.toUpperCase()];
          break;
        }
      }
      
      if (!currentPrice) continue;

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // Apply Internal Stop Loss Lifecycle
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

    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `24/7 SYNC: ${updateCount} UPDATED`,
      details: `Exchange: Binance Global\nSource: ${futuresResult?.source || 'N/A'} (Futures), ${spotResult?.source || 'N/A'} (Spot)\nStatus: ${updateCount} updated, ${stoppedCount} stopped.`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, stopped: stoppedCount });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Sync Failure - Region Blocked",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}