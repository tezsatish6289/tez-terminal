import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { formatZonesUpdatedAt } from "@/lib/levels/slideshow-zones";

export type ChartAttributionVariant = "intraday" | "trend" | "outlook" | "history";

export function chartAttributionHeadline(variant: ChartAttributionVariant): string {
  switch (variant) {
    case "intraday":
    case "trend":
      return "Support & resistance from Put/Call OI clusters & Max Pain";
    case "outlook":
      return "Forward levels from option-chain positioning (Put/Call clusters & Max Pain)";
    case "history":
      return "Historical Put/Call OI walls & Max Pain";
  }
}

export function chartAttributionMeta(
  levels: PublicLevels | null | undefined,
): string | null {
  const when = formatZonesUpdatedAt(levels?.computedAt);
  const expiry = levels?.zonesExpiry?.trim();
  const parts: string[] = [];
  if (when) parts.push(`Updated ${when}`);
  if (expiry) parts.push(`Expiry ${expiry}`);
  return parts.length ? parts.join(" · ") : null;
}
