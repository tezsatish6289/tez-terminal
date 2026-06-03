/**
 * /api/freedombot/levels/candles?symbol=CDSL&interval=5
 *
 * Intraday OHLC candles for an NSE F&O stock, sourced from Dhan and cached
 * server-side (60s). Feeds the native lightweight-charts candlestick chart on
 * freedombot.ai/levels → NSE Stocks (TradingView's free embed blocks NSE data).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStockCandles } from "@/lib/dhan-candles";
import { isValidFnoSymbol, normalizeStockSymbol } from "@/lib/equity-zones-on-demand";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") ?? "";
  const interval = searchParams.get("interval") ?? "5";

  const symbol = normalizeStockSymbol(rawSymbol);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }
  if (!isValidFnoSymbol(symbol)) {
    return NextResponse.json(
      { ok: false, error: "Symbol is not in the NSE F&O universe" },
      { status: 404 },
    );
  }

  try {
    const result = await getStockCandles(symbol, interval);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "No candles", candles: [] },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: true, symbol, interval, candles: result.candles, stale: result.stale ?? false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, candles: [] }, { status: 500 });
  }
}
