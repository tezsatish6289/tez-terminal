/**
 * /api/freedombot/levels/candles?symbol=NIFTY&scope=index&interval=15
 * /api/freedombot/levels/candles?symbol=CDSL&scope=stock&interval=15
 *
 * Intraday OHLC from Dhan (60s server cache). Feeds native charts on freedombot.ai/levels.
 */

import { NextRequest, NextResponse } from "next/server";
import { getIndexCandles, getStockCandles } from "@/lib/dhan-candles";
import { isValidFnoSymbol, normalizeStockSymbol } from "@/lib/nse/fno-symbol";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") ?? "";
  const interval = searchParams.get("interval") ?? "5";
  const scope = (searchParams.get("scope") ?? "stock").toLowerCase();

  if (scope === "index") {
    const indexKey = normalizeIndexKey(rawSymbol);
    if (!indexKey) {
      return NextResponse.json(
        { ok: false, error: "Unknown NSE index symbol" },
        { status: 404 },
      );
    }
    try {
      const result = await getIndexCandles(indexKey, interval);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error ?? "No candles", candles: [] },
          { status: 502 },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          symbol: indexKey,
          scope: "index",
          interval,
          candles: result.candles,
          stale: result.stale ?? false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, error: msg, candles: [] }, { status: 500 });
    }
  }

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
      {
        ok: true,
        symbol,
        scope: "stock",
        interval,
        candles: result.candles,
        stale: result.stale ?? false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, candles: [] }, { status: 500 });
  }
}
