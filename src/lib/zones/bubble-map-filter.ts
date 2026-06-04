import type { BubbleTone } from "@/lib/zones/bubble-tone";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";

/** Active filter on the market bubbles map (replaces All / Bullish / Bearish). */
export type BubbleMapFilter = "all" | "IN_BULL" | "NEAR_BULL" | "IN_BEAR" | "NEAR_BEAR" | "UNSCANNED";

export const BUBBLE_MAP_FILTER_KEYS: Exclude<BubbleMapFilter, "all">[] = [
  "IN_BULL",
  "NEAR_BULL",
  "IN_BEAR",
  "NEAR_BEAR",
  "UNSCANNED",
];

export function bubbleMatchesMapFilter(tone: BubbleTone, filter: BubbleMapFilter): boolean {
  if (filter === "all") return true;
  return tone === filter;
}

export function countBubbleMapFilters(
  items: readonly { tone: BubbleTone }[],
): Record<BubbleMapFilter, number> {
  const out: Record<BubbleMapFilter, number> = {
    all: items.length,
    IN_BULL: 0,
    NEAR_BULL: 0,
    IN_BEAR: 0,
    NEAR_BEAR: 0,
    UNSCANNED: 0,
  };
  for (const it of items) {
    switch (it.tone) {
      case "IN_BULL":
        out.IN_BULL += 1;
        break;
      case "NEAR_BULL":
        out.NEAR_BULL += 1;
        break;
      case "IN_BEAR":
        out.IN_BEAR += 1;
        break;
      case "NEAR_BEAR":
        out.NEAR_BEAR += 1;
        break;
      case "UNSCANNED":
        out.UNSCANNED += 1;
        break;
      default:
        break;
    }
  }
  return out;
}

export function bubbleMapFilterLabel(filter: BubbleMapFilter): string {
  if (filter === "all") return "All";
  return BUBBLE_TONE_STYLE[filter].label;
}
