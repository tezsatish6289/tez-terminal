/**
 * Server-side PVT trend signal for the scoring engine.
 *
 * Fetches a symbol's daily candles (shared 30-min Dhan cache — same source the
 * PVT chart uses, so this piggybacks that cache entry rather than adding load),
 * computes the cumulative Price-Volume-Trend and reduces it to a normalised
 * slope in [-1, +1] anchored at the "toe-dip" (the SR zone-entry timestamp) via
 * {@link pvtSlopeSince}. This measures whether volume has confirmed the thesis
 * *since price entered the cluster* rather than over an arbitrary trailing
 * window. Best-effort: no dip anchor (symbol not in a zone) or any failure
 * returns null and the scorer renormalises over its remaining signals.
 */

import "server-only";

import { getIndexDailyCandles, getStockDailyCandles } from "@/lib/dhan-candles";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";
import { computePvt, pvtSlopeSince, PVT_LOOKBACK_DAYS, type PvtPoint } from "@/lib/levels/pvt";

/** Daily sessions after the dip used for the frozen entry-confirmation reading. */
export const PVT_ENTRY_WINDOW_SESSIONS = 5;

/**
 * The symbol's cumulative daily PVT series (~6mo), or null if unavailable. Fetch
 * once per event and derive the entry / current / exit slopes with
 * {@link pvtSlopeSince} rather than re-fetching per reading.
 */
export async function fetchDailyPvtPoints(
  scope: "stock" | "index",
  symbol: string,
): Promise<PvtPoint[] | null> {
  try {
    const result =
      scope === "index"
        ? await (async () => {
            const key = normalizeIndexKey(symbol);
            return key ? getIndexDailyCandles(key, PVT_LOOKBACK_DAYS) : null;
          })()
        : await getStockDailyCandles(symbol, PVT_LOOKBACK_DAYS);
    if (!result || !result.ok || !result.candles.length) return null;
    return computePvt(result.candles);
  } catch {
    return null;
  }
}

export async function fetchPvtSlope(
  scope: "stock" | "index",
  symbol: string,
  anchorTimeSec: number | null,
): Promise<number | null> {
  if (anchorTimeSec == null) return null; // no toe-dip → nothing to confirm
  const pvt = await fetchDailyPvtPoints(scope, symbol);
  return pvt ? pvtSlopeSince(pvt, anchorTimeSec) : null;
}
