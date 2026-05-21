/**
 * Manual trade punch — TP-room gate only (not full AUTO suppression).
 *
 * Allowed when bull or bear zone center has enough room to day-0 max pain:
 *   distance(strike → maxPain) ≥ max(2 × halfWidth, maxPainMinDistanceUsd)
 *
 * Does NOT block on signal conflict, panic regime, or pin chop — those are AUTO-only.
 */
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { effectiveMaxPainMinDistanceUsd } from "@/lib/options-zones";

/** Matches `TP_ROOM_PCT_OF_HALFWIDTH` in options-zones.ts */
const TP_ROOM_PCT_OF_HALFWIDTH = 2.0;

export interface ManualEntryGateResult {
  allowed: boolean;
  reason: string;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Same default as suggest-zones: null/undefined → 2 × halfWidth; 0 → off. */
export function resolveMaxPainMinDistanceUsd(
  halfWidthUsd: number,
  configured: number | null | undefined,
): number {
  if (configured === undefined || configured === null) {
    return 2 * halfWidthUsd;
  }
  if (configured <= 0) return 0;
  return configured;
}

/** `max(2 × halfWidth, configured)` — TP-room floor for zone center → max pain. */
export function computeMinTpRoomUsd(
  halfWidthUsd: number,
  maxPainMinDistanceUsd?: number | null,
): number {
  const configured = resolveMaxPainMinDistanceUsd(halfWidthUsd, maxPainMinDistanceUsd);
  const effective = effectiveMaxPainMinDistanceUsd(halfWidthUsd, configured);
  return effective > 0
    ? effective
    : TP_ROOM_PCT_OF_HALFWIDTH * halfWidthUsd;
}

export function evaluateManualEntryGate(
  suggested: SuggestedZonesSnapshot | null,
  maxPainMinDistanceUsd?: number | null,
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

  const minTpRoomUsd = computeMinTpRoomUsd(half, maxPainMinDistanceUsd);
  const bullStrike = suggested.bullStrike;
  const bearStrike = suggested.bearStrike;

  const bullHasTpRoom =
    bullStrike != null && day0MaxPain >= bullStrike + minTpRoomUsd;
  const bearHasTpRoom =
    bearStrike != null && day0MaxPain <= bearStrike - minTpRoomUsd;

  if (bullHasTpRoom || bearHasTpRoom) {
    return { allowed: true, reason: "" };
  }

  const dynamic = TP_ROOM_PCT_OF_HALFWIDTH * half;
  const floorClause =
    resolveMaxPainMinDistanceUsd(half, maxPainMinDistanceUsd) > dynamic
      ? `min-distance ${fmtUsd(resolveMaxPainMinDistanceUsd(half, maxPainMinDistanceUsd))}`
      : `${TP_ROOM_PCT_OF_HALFWIDTH}× halfWidth ${fmtUsd(dynamic)}`;

  if (bullStrike == null && bearStrike == null) {
    return {
      allowed: false,
      reason: `No zone strike — need ${fmtUsd(minTpRoomUsd)} TP room to max pain ${fmtUsd(day0MaxPain)} (${floorClause})`,
    };
  }

  const side: "bull" | "bear" = bullStrike != null ? "bull" : "bear";
  const center = (side === "bull" ? bullStrike : bearStrike) as number;
  const room = Math.abs(day0MaxPain - center);

  return {
    allowed: false,
    reason: `TP room ${fmtUsd(room)} from ${side} zone ${fmtUsd(center)} to max pain ${fmtUsd(day0MaxPain)} — need ${fmtUsd(minTpRoomUsd)} (${floorClause})`,
  };
}
