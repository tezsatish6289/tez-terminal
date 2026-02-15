import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for Binance Futures APIs.
 * This bypasses browser CORS restrictions and provides price/history data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // 'price' or 'history'
  const symbol = searchParams.get("symbol");
  const startTime = searchParams.get("startTime");

  try {
    // 1. LATEST PRICES PROXY (Current Feed)
    if (type === "price" || !type) {
      const response = await fetch("https://fapi.binance.com/fapi/v2/ticker/price", {
        next: { revalidate: 0 },
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`Binance API Error: ${response.status}`);
      const data = await response.json();
      const priceMap: Record<string, number> = {};
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if (item.symbol && item.price) {
            priceMap[item.symbol] = parseFloat(item.price);
          }
        });
      }
      return NextResponse.json(priceMap);
    }

    // 2. HISTORICAL PERFORMANCE PROXY (For Max Upside/Drawdown)
    if (type === "history" && symbol && startTime) {
      // Fetch 1m candles since signal was received
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=1m&startTime=${startTime}&limit=1500`;
      const response = await fetch(url, { next: { revalidate: 30 } });
      
      if (!response.ok) throw new Error(`History API Error: ${response.status}`);
      const klines = await response.json();
      
      // Calculate Max High and Min Low from history
      let maxHigh = -Infinity;
      let minLow = Infinity;

      if (Array.isArray(klines)) {
        klines.forEach((k: any) => {
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          if (high > maxHigh) maxHigh = high;
          if (low < minLow) minLow = low;
        });
      }

      return NextResponse.json({ 
        maxHigh: maxHigh === -Infinity ? null : maxHigh, 
        minLow: minLow === Infinity ? null : minLow 
      });
    }

    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  } catch (error: any) {
    console.error("[Price Proxy Error]", error.message);
    return NextResponse.json({ error: "Failed to fetch data from Binance" }, { status: 500 });
  }
}
