import type { SrResolveReason, SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";

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

export type SrDisplayOutcome = "win" | "loss" | "open";

/** Admin-table status: win (max pain / zone flip), loss (invalidated), open (tracking). */
export function srEventDisplayStatus(
  event: Pick<SrZoneEvent, "state" | "reachedTarget" | "hitPoc" | "resolveReason">,
): { outcome: SrDisplayOutcome; title: string; subtitle: string } {
  if (event.resolveReason === "zone_flip") {
    return { outcome: "win", title: "Win", subtitle: "zone flip" };
  }
  if (event.reachedTarget === true || event.hitPoc === true) {
    return { outcome: "win", title: "Win", subtitle: "max pain hit" };
  }
  if (event.resolveReason === "invalidation") {
    return { outcome: "loss", title: "Loss", subtitle: "entry zone invalidated" };
  }
  return { outcome: "open", title: "Open", subtitle: "" };
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
