/**
 * Manual trade punch — TP-room gate only (not full AUTO suppression).
 *
 * Allowed when bull or bear zone center has enough room to day-0 max pain:
 *   distance(strike → maxPain) ≥ 2 × halfWidth
 *
 * The 2× factor mirrors `MAX_PAIN_GAP_HALFWIDTHS` in `options-zones.ts` —
 * one number, used in three places (cluster pick, TP-room reach,
 * manual gate) so the manual punch and the AUTO bot agree on what
 * "actionable" means. Previous operator override (`maxPainMinDistanceUsd`)
 * was removed 2026-05-22.
 *
 * Does NOT block on signal conflict, panic regime, or pin chop — those
 * are AUTO-only.
 */
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { maxPainGapUsd } from "@/lib/options-zones";

export interface ManualEntryGateResult {
  allowed: boolean;
  reason: string;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function evaluateManualEntryGate(
  suggested: SuggestedZonesSnapshot | null,
): ManualEntryGateResult {
  if (!suggested) {
    return { allowed: false, reason: "No zone data — refresh Deribit zones first" };
  }

  const half = suggested.halfWidthUsd;
  if (half == null || !Number.isFinite(half) || half <= 0) {
    return { allowed: false, reason: "Half-width unavailable — refresh zones" };
  }

  const day0MaxPain = suggested.maxPain;
  if (day0MaxPain == null || !Number.isFinite(day0MaxPain)) {
    return { allowed: false, reason: "Today's max pain unavailable — refresh zones" };
  }

  const minTpRoomUsd = maxPainGapUsd(half);
  const bullStrike = suggested.bullStrike;
  const bearStrike = suggested.bearStrike;

  const bullHasTpRoom =
    bullStrike != null && day0MaxPain >= bullStrike + minTpRoomUsd;
  const bearHasTpRoom =
    bearStrike != null && day0MaxPain <= bearStrike - minTpRoomUsd;

  if (bullHasTpRoom || bearHasTpRoom) {
    return { allowed: true, reason: "" };
  }

  if (bullStrike == null && bearStrike == null) {
    return {
      allowed: false,
      reason: `No zone strike — need ${fmtUsd(minTpRoomUsd)} TP room to max pain ${fmtUsd(day0MaxPain)} (2× halfWidth)`,
    };
  }

  const side: "bull" | "bear" = bullStrike != null ? "bull" : "bear";
  const center = (side === "bull" ? bullStrike : bearStrike) as number;
  const room = Math.abs(day0MaxPain - center);

  return {
    allowed: false,
    reason: `TP room ${fmtUsd(room)} from ${side} zone ${fmtUsd(center)} to max pain ${fmtUsd(day0MaxPain)} — need ${fmtUsd(minTpRoomUsd)} (2× halfWidth)`,
  };
}
