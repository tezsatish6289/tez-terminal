import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

/** True when NSE ladder data exists but fewer than 2 expiry slices (picker / Outlook need 2+). */
export function levelsNeedMultiExpiryRefresh(data: PublicLevels | null | undefined): boolean {
  if (!data || (data.bullLow == null && data.bearLow == null)) return false;
  if (data.levelsSource === "dhan") return false;
  return (data.zonesByExpiry?.length ?? 0) < 2;
}
