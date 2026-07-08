/**
 * Pure core for the confirmed bullish / bearish bubble signal. No I/O and no
 * `server-only` guard, so it runs on the client (type import) and in unit tests.
 *
 *   bullish  = put-cluster dip + PVT up   + spot back above the dipped put wall
 *              + spot still below the current call wall (room to run up)
 *   bearish  = call-cluster dip + PVT down + spot back below the dipped call wall
 *              + spot still above the current put wall (room to fall)
 */

export type ConfirmedSignal = "bullish" | "bearish";

/** Dip-anchored reads from an open SR event — stable; `currentPvt` is derived live on the chart. */
export type ConfirmedSignalContext = {
  side: "support" | "resistance";
  entryPvt: number;
  /** OI wall price dipped at entry: put wall (support) / call wall (resistance). */
  originalCluster: number;
};

/**
 * Evaluate the signal from pre-resolved inputs. The current opposite wall is
 * required: without it we can't confirm "room to target".
 */
export function evalConfirmedSignal(input: {
  side: "support" | "resistance";
  entryPvt: number | null;
  currentPvt: number | null;
  /** OI wall price dipped at entry: put wall (support) / call wall (resistance). */
  originalCluster: number | null;
  spot: number | null;
  /** Current walls from today's zone doc. */
  currentPutStrike: number | null;
  currentCallStrike: number | null;
}): ConfirmedSignal | null {
  const { side, entryPvt, currentPvt, originalCluster, spot } = input;
  if (spot == null || entryPvt == null || currentPvt == null || originalCluster == null) {
    return null;
  }

  if (side === "support") {
    if (!(currentPvt > entryPvt)) return null; // PVT must be rising since the dip
    if (!(spot > originalCluster)) return null; // bounced back above the put wall
    const call = input.currentCallStrike;
    if (call == null || !(spot < call)) return null; // room up to the call wall
    return "bullish";
  }

  if (!(currentPvt < entryPvt)) return null; // PVT must be falling since the dip
  if (!(spot < originalCluster)) return null; // rejected back below the call wall
  const put = input.currentPutStrike;
  if (put == null || !(spot > put)) return null; // room down to the put wall
  return "bearish";
}
