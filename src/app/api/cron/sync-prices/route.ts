import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 24/7 PERFORMANCE SYNC ENGINE
 * Optimized for Asian Regions (Singapore/Mumbai).
 * Bypasses US blocks by operating from approved global nodes.
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
  
  // Primary Binance Endpoints (Working perfectly in Singapore)
  const spotUrl = "https://api.binance.com/api/v3/ticker/price";
  const futuresUrl = "https://fapi.binance.com/fapi/v2/ticker/price";

  try {
    const [spotRes, futuresRes] = await Promise.all([
      fetch(spotUrl, { cache: 'no-store' }),
      fetch(futuresUrl, { cache: 'no-store' })
    ]);

    if (!spotRes.ok || !futuresRes.ok) {
      throw new Error(`Binance Connectivity Issue: Spot ${spotRes.status}, Futures ${futuresRes.status}`);
    }

    const spotData = await spotRes.json();
    const futuresData = await futuresRes.json();
    const priceMap: Record<string, number> = {};

    [...spotData, ...futuresData].forEach((p: any) => {
      if (p.symbol && p.price) {
        priceMap[p.symbol.toUpperCase()] = parseFloat(p.price);
      }
    });

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    let updateCount = 0;
    
    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;

      const base = (signal.symbol || "").split(':').pop() || "";
      const symbol = base.replace(/\.P$|\.PERP$/i, '').toUpperCase();
      
      const currentPrice = priceMap[symbol] || priceMap[symbol + "USDT"];
      
      if (!currentPrice) continue;

      const alertPrice = Number(signal.price);
      const stopLoss = Number(signal.stopLoss || 0);
      let newStatus = "ACTIVE";

      // Stop Loss Logic
      if (stopLoss > 0) {
        if (signal.type === 'BUY' && currentPrice <= stopLoss) newStatus = "INACTIVE";
        else if (signal.type === 'SELL' && currentPrice >= stopLoss) newStatus = "INACTIVE";
      }

      // Track Extreme Excursions
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
      message: `24/7 SYNC SUCCESS: ${updateCount} ACTIVE`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Sync Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
