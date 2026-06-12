/**
 * /api/sim/candles?symbol=BTCUSDT&interval=15
 *
 * Intraday OHLC from Bybit linear perps (60s server cache).
 * Feeds native charts on tezterminal.com/simulation.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getLinearCandles,
  normalizeBybitLinearSymbol,
  type CandleErrorCode,
  type CandleResult,
} from "@/lib/bybit-candles";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NEUTRAL_ERROR: Record<CandleErrorCode, string> = {
  rate_limit: "Live chart is busy right now — it'll refresh automatically in a moment.",
  no_data: "Chart data isn't available for this symbol yet.",
  unavailable: "Chart data is temporarily unavailable — retrying shortly.",
};

function candleErrorResponse(symbol: string, result: Pick<CandleResult, "error" | "code">) {
  const code: CandleErrorCode = result.code ?? "unavailable";
  if (result.error) console.warn(`[sim/candles] ${symbol}: ${result.error}`);
  return NextResponse.json(
    { ok: false, error: NEUTRAL_ERROR[code], code, retryable: code !== "no_data", candles: [] },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol") ?? "";
  const interval = searchParams.get("interval") ?? "15";

  const symbol = normalizeBybitLinearSymbol(rawSymbol);
  if (!symbol) {
    return NextResponse.json(
      { ok: false, error: "Unsupported symbol — use BTCUSDT, ETHUSDT, SOLUSDT, or XRPUSDT" },
      { status: 400 },
    );
  }

  try {
    const result = await getLinearCandles(symbol, interval);
    if (!result.ok) return candleErrorResponse(symbol, result);
    return NextResponse.json(
      {
        ok: true,
        symbol,
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
