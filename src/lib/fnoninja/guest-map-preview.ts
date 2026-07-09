import type { LevelsBubbleItem } from "@/components/levels/LevelsBubblesView";
import { isInZoneTone } from "@/lib/levels/bubble-physics";

const GUEST_PREVIEW_MAX = 2;

/** Pick 1–2 bubbles to label on the signed-out market map preview (NIFTY + one in-zone stock). */
export function pickGuestPreviewBubbleIds(items: LevelsBubbleItem[]): Set<string> {
  const ids = new Set<string>();

  const nifty = items.find((it) => it.scope === "index" && it.symbol === "NIFTY");
  if (nifty) ids.add(nifty.id);

  if (ids.size >= GUEST_PREVIEW_MAX) return ids;

  const inZoneStock = items.find(
    (it) => it.scope === "stock" && isInZoneTone(it.tone) && !ids.has(it.id),
  );
  if (inZoneStock) ids.add(inZoneStock.id);

  if (ids.size >= GUEST_PREVIEW_MAX) return ids;

  const anyIndex = items.find((it) => it.scope === "index" && !ids.has(it.id));
  if (anyIndex) ids.add(anyIndex.id);

  if (ids.size >= GUEST_PREVIEW_MAX) return ids;

  const anyStock = items.find((it) => it.scope === "stock" && !ids.has(it.id));
  if (anyStock) ids.add(anyStock.id);

  return ids;
}
