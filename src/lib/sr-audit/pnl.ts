import type { SrResolveReason, SrZoneSide } from "@/lib/sr-audit/types";

/** Signed PnL % from entry spot (support = long, resistance = short). */
export function srPnlPct(
  side: SrZoneSide,
  entrySpot: number,
  spot: number,
): number | null {
  if (!Number.isFinite(entrySpot) || entrySpot <= 0 || !Number.isFinite(spot)) return null;
  if (side === "support") return ((spot - entrySpot) / entrySpot) * 100;
  return ((entrySpot - spot) / entrySpot) * 100;
}

export function srCloseComment(
  reason: SrResolveReason | null | undefined,
  stored?: string | null,
): string {
  if (stored) return stored;
  switch (reason) {
    case "invalidation":
      return "closed — invalidated";
    case "zone_flip":
      return "closed — zone flip";
    case "left_zone":
      return "closed — left zone (legacy)";
    case "timeout":
      return "closed — timeout (legacy)";
    default:
      return "—";
  }
}

/** Opposite zone reached — thesis resolved by flip, not neutral drift. */
export function isZoneFlipStatus(
  status: string | undefined,
  side: SrZoneSide,
): boolean {
  if (side === "support") return status === "IN_BEAR";
  return status === "IN_BULL";
}

export function closeCommentForReason(reason: SrResolveReason): string {
  return srCloseComment(reason);
}
