/**
 * Server-side PVT trend signal for the scoring engine.
 *
 * Fetches a symbol's daily candles (shared 30-min Dhan cache — same source the
 * PVT chart uses, so this piggybacks that cache entry rather than adding load),
 * computes the cumulative Price-Volume-Trend and reduces it to a normalised
 * slope in [-1, +1] via {@link pvtSlopeSignal}. Best-effort: any failure returns
 * null and the scorer simply renormalises over its remaining signals.
 */

import "server-only";

import { getIndexDailyCandles, getStockDailyCandles } from "@/lib/dhan-candles";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";
import { computePvt, pvtSlopeSignal, PVT_LOOKBACK_DAYS } from "@/lib/levels/pvt";

/** Trading days used for the slope window (~4 weeks of sessions). */
const PVT_SIGNAL_WINDOW = 20;

export async function fetchPvtSlope(
  scope: "stock" | "index",
  symbol: string,
  window: number = PVT_SIGNAL_WINDOW,
): Promise<number | null> {
  try {
    const result =
      scope === "index"
        ? await (async () => {
            const key = normalizeIndexKey(symbol);
            return key ? getIndexDailyCandles(key, PVT_LOOKBACK_DAYS) : null;
          })()
        : await getStockDailyCandles(symbol, PVT_LOOKBACK_DAYS);
    if (!result || !result.ok || !result.candles.length) return null;
    return pvtSlopeSignal(computePvt(result.candles), window);
  } catch {
    return null;
  }
}
