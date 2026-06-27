/**
 * /api/freedombot/levels/candles?symbol=NIFTY&scope=index&interval=15
 * /api/freedombot/levels/candles?symbol=CDSL&scope=stock&interval=15
 *
 * Intraday OHLC from Dhan (60s server cache). Feeds native charts on freedombot.ai/levels.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getIndexCandles,
  getIndexDailyCandles,
  getStockCandles,
  getStockDailyCandles,
  type CandleErrorCode,
  type CandleResult,
} from "@/lib/dhan-candles";
import { isValidFnoSymbolDb } from "@/lib/nse/fno-universe-runtime";
import { getAdminFirestore } from "@/firebase/admin";
import { normalizeStockSymbol } from "@/lib/nse/fno-symbol";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

/** Vendor-neutral, user-safe copy. Raw upstream errors never reach the client. */
const NEUTRAL_ERROR: Record<CandleErrorCode, string> = {
  rate_limit: "Live chart is busy right now — it’ll refresh automatically in a moment.",
  no_data: "Chart data isn’t available for this symbol yet.",
  unavailable: "Chart data is temporarily unavailable — retrying shortly.",
};

/** Build a sanitized failure payload (logs the raw cause server-side only). */
function candleErrorResponse(symbol: string, result: Pick<CandleResult, "error" | "code">) {
  const code: CandleErrorCode = result.code ?? "unavailable";
  if (result.error) console.warn(`[levels/candles] ${symbol}: ${result.error}`);
  return NextResponse.json(
    { ok: false, error: NEUTRAL_ERROR[code], code, retryable: code !== "no_data", candles: [] },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

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
      const daily = interval.toUpperCase() === "D";
      const result = daily
        ? await getIndexDailyCandles(indexKey)
        : await getIndexCandles(indexKey, interval);
      if (!result.ok) return candleErrorResponse(indexKey, result);
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
      return candleErrorResponse(indexKey, {
        error: e instanceof Error ? e.message : String(e),
        code: "unavailable",
      });
    }
  }

  const symbol = normalizeStockSymbol(rawSymbol);
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }
  if (!(await isValidFnoSymbolDb(getAdminFirestore(), symbol))) {
    return NextResponse.json(
      { ok: false, error: "Symbol is not in the NSE F&O universe" },
      { status: 404 },
    );
  }

  try {
    const daily = interval.toUpperCase() === "D";
    const result = daily
      ? await getStockDailyCandles(symbol)
      : await getStockCandles(symbol, interval);
    if (!result.ok) return candleErrorResponse(symbol, result);
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
    return candleErrorResponse(symbol, {
      error: e instanceof Error ? e.message : String(e),
      code: "unavailable",
    });
  }
}
