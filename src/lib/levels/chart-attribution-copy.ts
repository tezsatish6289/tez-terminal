import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { formatZonesUpdatedAt } from "@/lib/levels/slideshow-zones";
import { formatOutlookExpiryMeta } from "@/lib/levels/outlook-series";

export type ChartAttributionVariant = "intraday" | "trend" | "outlook" | "history";

export function chartAttributionHeadline(variant: ChartAttributionVariant): string {
  switch (variant) {
    case "trend":
      return "Support/ Resistance/ Max Pain derived from Call/Put OI clusters";
    case "intraday":
      return "Support & resistance from Put/Call OI clusters & Max Pain";
    case "outlook":
      return "Forward levels from option-chain positioning (Put/Call clusters & Max Pain)";
    case "history":
      return "Historical Put/Call OI walls & Max Pain";
  }
}

export function chartAttributionMeta(
  levels: PublicLevels | null | undefined,
  variant: ChartAttributionVariant = "intraday",
): string | null {
  const when = formatZonesUpdatedAt(levels?.computedAt);
  if (variant === "trend") {
    return when ? `Updated ${when}` : null;
  }
  if (variant === "outlook") {
    const parts: string[] = [];
    if (when) parts.push(`Updated ${when}`);
    const expiries = formatOutlookExpiryMeta(levels, levels?.spot ?? null);
    if (expiries) parts.push(`Columns: ${expiries}`);
    return parts.length ? parts.join(" · ") : null;
  }
  const expiry = levels?.zonesExpiry?.trim();
  const parts: string[] = [];
  if (when) parts.push(`Updated ${when}`);
  if (expiry) parts.push(`Expiry ${expiry}`);
  return parts.length ? parts.join(" · ") : null;
}
