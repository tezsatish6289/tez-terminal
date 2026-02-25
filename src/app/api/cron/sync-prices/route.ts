import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 24/7 PERFORMANCE SYNC ENGINE - ASIA OPTIMIZED
 * This engine runs from Singapore (asia-southeast1) to bypass US-region blocks.
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
  
  const spotPriceMap: Record<string, number> = {};
  const perpetualsPriceMap: Record<string, number> = {};
  const fetchOptions = { cache: 'no-store' as RequestCache, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } };

  const fillPriceMap = (data: any[], map: Record<string, number>) => {
    if (!Array.isArray(data)) return;
    data.forEach((p: any) => {
      if (p.symbol && p.price) map[p.symbol.toUpperCase()] = parseFloat(p.price);
    });
  };

  try {
    const spotUrl = "https://api.binance.com/api/v3/ticker/price";
    const perpetualsUrl = "https://fapi.binance.com/fapi/v2/ticker/price";

    const spotRes = await fetch(spotUrl, fetchOptions);
    if (spotRes.ok) fillPriceMap(await spotRes.json(), spotPriceMap);

    const perpetualsRes = await fetch(perpetualsUrl, fetchOptions);
    if (perpetualsRes.ok) fillPriceMap(await perpetualsRes.json(), perpetualsPriceMap);

    const signalsSnap = await getDocs(collection(firestore, "signals"));
    let updateCount = 0;
    let skipCount = 0;

    for (const signalDoc of signalsSnap.docs) {
      const signal = signalDoc.data();
      if (signal.status !== "ACTIVE") continue;

      const rawSymbol = (signal.symbol || "").split(':').pop() || "";
      const isPerpetual = /\.P$|\.PERP$/i.test(rawSymbol);
      const symbol = rawSymbol.replace(/\.P$|\.PERP$/i, '').toUpperCase();

      const priceMap = isPerpetual ? perpetualsPriceMap : spotPriceMap;
      const currentPrice = priceMap[symbol] ?? priceMap[symbol + "USDT"];

      if (!currentPrice) {
        skipCount++;
        await addDoc(logsRef, {
          timestamp: new Date().toISOString(),
          level: "WARN",
          message: "Symbol not in Binance feed",
          details: `signalId=${signalDoc.id} symbol=${rawSymbol} normalized=${symbol} feed=${isPerpetual ? "perpetuals" : "spot"}`,
          webhookId: "SYSTEM_CRON",
        });
        continue;
      }

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
      message: `ASIA SYNC: updated=${updateCount} skipped=${skipCount} (symbol not in Binance feed)`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({ success: true, updated: updateCount, skipped: skipCount });
  } catch (error: any) {
    await addDoc(logsRef, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Sync Failure in Singapore Node",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
