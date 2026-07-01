import type { BubbleTone } from "@/lib/zones/bubble-tone";
import { isSlideshowStripTone } from "@/lib/zones/bubble-map-filter";

type LayoutItem = { scope: "index" | "stock"; tone: BubbleTone };

/** Mobile hero embed: zone setups + indices only (fallback sample when none). */
export function pickEmbedMobileLayoutItems<T extends LayoutItem>(items: T[]): T[] {
  const priority = items.filter(
    (it) => it.scope === "index" || isSlideshowStripTone(it.tone),
  );
  if (priority.some((it) => it.scope === "stock")) return priority;

  const indices = items.filter((it) => it.scope === "index");
  const filler = items.filter((it) => it.scope === "stock").slice(0, 18);
  return [...indices, ...filler];
}
