import { NextResponse } from "next/server";

/**
 * Server-side proxy for Binance Futures Price API.
 * Bypasses browser CORS restrictions and provides a standardized price map.
 */
export async function GET() {
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v2/ticker/price", {
      next: { revalidate: 0 },
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Binance API responded with ${response.status}`);
    }

    const data = await response.json();
    
    // Convert array to an efficient lookup map for the client
    const priceMap: Record<string, number> = {};
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.symbol && item.price) {
          priceMap[item.symbol] = parseFloat(item.price);
        }
      });
    }

    return NextResponse.json(priceMap);
  } catch (error: any) {
    console.error("[Price Proxy Error]", error.message);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
