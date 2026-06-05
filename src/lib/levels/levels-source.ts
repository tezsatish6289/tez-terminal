import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

/** Public-facing provenance for level bands (neutral names — no vendor labels in UI copy). */
export type PublicLevelsSource = "nse" | "dhan";

export function storedSourceToPublic(
  source: string | null | undefined,
): PublicLevelsSource | null {
  if (source === "nse_equity" || source === "nse") return "nse";
  if (source === "dhan_equity" || source === "dhan") return "dhan";
  return null;
}

export function isHighConfidenceLevels(
  levels: Pick<PublicLevels, "levelsSource"> | null | undefined,
): boolean {
  return levels?.levelsSource === "nse";
}
