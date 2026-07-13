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

import {
  getIndexCandles,
  getIndexDailyCandles,
  getStockCandles,
  getStockDailyCandles,
} from "@/lib/dhan-candles";
import { normalizeIndexKey } from "@/lib/nse/dhan-index-ids";
import {
  computePvt,
  pvtSlopeSignal,
  pvtSlopeSince,
  PVT_LOOKBACK_DAYS,
  type PvtPoint,
} from "@/lib/levels/pvt";

/** Daily sessions after the dip used for the frozen entry-confirmation reading. */
export const PVT_ENTRY_WINDOW_SESSIONS = 5;

/** Trailing 15m bars when there is no zone-entry anchor (~1 session). */
const INTRADAY_PVT_TRAIL_BARS = 26;

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

/**
 * 15m intraday PVT slope in [-1, +1].
 * Prefers zone-entry anchor (same toe-dip as daily) so same-day hits can confirm
 * before enough daily sessions exist; falls back to a trailing session window.
 */
export async function fetchIntradayPvtSlope(
  scope: "stock" | "index",
  symbol: string,
  anchorTimeSec: number | null,
): Promise<number | null> {
  try {
    const result =
      scope === "index"
        ? await (async () => {
            const key = normalizeIndexKey(symbol);
            return key ? getIndexCandles(key, "15") : null;
          })()
        : await getStockCandles(symbol, "15");
    if (!result || !result.ok || !result.candles.length) return null;
    const pvt = computePvt(result.candles);
    if (pvt.length < 3) return null;
    if (anchorTimeSec != null) {
      const since = pvtSlopeSince(pvt, anchorTimeSec);
      if (since != null) return since;
    }
    return pvtSlopeSignal(pvt, INTRADAY_PVT_TRAIL_BARS);
  } catch {
    return null;
  }
}
