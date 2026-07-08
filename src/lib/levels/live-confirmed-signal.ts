/**
 * Re-evaluate the confirmed PVT signal using the trend chart's already-fetched
 * daily candles (incl. today's live OHLC). No extra Dhan calls — piggybacks on
 * the candle payload the PVT chart pulls for rendering.
 */

import {
  evalConfirmedSignal,
  type ConfirmedSignal,
  type ConfirmedSignalContext,
} from "@/lib/levels/confirmed-signal-core";
import { computePvt, type PvtInputCandle } from "@/lib/levels/pvt";

export function liveCurrentPvtFromCandles(
  candles: readonly PvtInputCandle[],
): number | null {
  if (!candles.length) return null;
  const points = computePvt(candles);
  return points[points.length - 1]?.value ?? null;
}

export function liveConfirmedSignalFromCandles(
  context: ConfirmedSignalContext,
  candles: readonly PvtInputCandle[],
  geometry: {
    spot: number | null;
    putClusterStrike: number | null;
    callClusterStrike: number | null;
  },
): ConfirmedSignal | null {
  const currentPvt = liveCurrentPvtFromCandles(candles);
  return evalConfirmedSignal({
    side: context.side,
    entryPvt: context.entryPvt,
    currentPvt,
    originalCluster: context.originalCluster,
    spot: geometry.spot,
    currentPutStrike: geometry.putClusterStrike,
    currentCallStrike: geometry.callClusterStrike,
  });
}
