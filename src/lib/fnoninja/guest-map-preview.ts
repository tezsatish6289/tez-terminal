import type { LevelsBubbleItem } from "@/components/levels/LevelsBubblesView";
import type { BubbleTone } from "@/lib/zones/bubble-tone";

export type GuestBubbleLabelMode = "full" | "masked";

export interface GuestBubbleLabel {
  /** Symbol text shown on the bubble (full or partially masked). */
  symbol: string;
  mode: GuestBubbleLabelMode;
}

/** Zone setups + confirmed directional signals — teased for signed-out users. */
export function isGuestInterestingTone(tone: BubbleTone): boolean {
  return (
    tone === "BULLISH" ||
    tone === "BEARISH" ||
    tone === "IN_BULL" ||
    tone === "IN_BEAR" ||
    tone === "NEAR_BULL" ||
    tone === "NEAR_BEAR"
  );
}

/** Partially hide symbol — e.g. DELHIVERY → DELH**** */
export function maskGuestSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.length <= 4) return `${s.slice(0, Math.max(1, s.length - 1))}*`;
  const tail = Math.min(4, s.length - 4);
  return `${s.slice(0, 4)}${"*".repeat(tail)}`;
}

function guestRevealCount(interestingCount: number): number {
  if (interestingCount <= 0) return 0;
  return Math.max(1, Math.round(interestingCount * 0.25));
}

/**
 * Signed-out /levels bubble labels:
 * - Neutral / max-pain / awaiting scan → full symbol + price
 * - Interesting setups → 25% full names, 75% masked names (all show price)
 */
export function buildGuestBubbleLabels(items: LevelsBubbleItem[]): Map<string, GuestBubbleLabel> {
  const out = new Map<string, GuestBubbleLabel>();

  const interesting = items
    .filter((it) => isGuestInterestingTone(it.tone))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));

  const revealIds = new Set(
    interesting.slice(0, guestRevealCount(interesting.length)).map((it) => it.id),
  );

  for (const item of items) {
    if (!isGuestInterestingTone(item.tone)) {
      out.set(item.id, { symbol: item.symbol, mode: "full" });
      continue;
    }
    if (revealIds.has(item.id)) {
      out.set(item.id, { symbol: item.symbol, mode: "full" });
    } else {
      out.set(item.id, { symbol: maskGuestSymbol(item.symbol), mode: "masked" });
    }
  }

  return out;
}
