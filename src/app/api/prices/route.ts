
import { NextResponse } from "next/server";

/**
 * Server-side proxy for Binance Futures Price API.
 * Bypasses browser CORS restrictions to guarantee price delivery.
 */
export async function GET() {
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v2/ticker/price", {
      next: { revalidate: 0 }, // Ensure fresh data
    });

    if (!response.ok) {
      throw new Error(`Binance API responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Price Proxy Error]", error.message);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
