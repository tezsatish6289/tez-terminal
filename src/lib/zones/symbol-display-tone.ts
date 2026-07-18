import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  deriveBubbleDisplayTone,
  type BubbleTone,
} from "@/lib/zones/bubble-tone";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import { matchesSlideshowSetup } from "@/lib/zones/zone-status";

/** Zone tone for chips and chart headers. */
export function resolveSymbolDisplayTone(
  data: PublicLevels | null | undefined,
  opts?: {
    scanned?: boolean;
    spotOverride?: number | null;
  },
): BubbleTone {
  const bands = bandsFromLevels(data, opts?.spotOverride);
  const scanned =
    opts?.scanned ??
    Boolean(
      data != null && (data.bullLow != null || data.bearLow != null || data.spot != null),
    );
  const poc = data?.poc ?? null;
  const bandOffset = data?.bandOffset ?? null;
  const oi = data?.oi ?? null;
  const actionable =
    scanned && matchesSlideshowSetup(bands, poc, "all", bandOffset, oi);
  return deriveBubbleDisplayTone(
    bands,
    scanned,
    actionable,
    poc,
    bandOffset,
    oi,
  );
}
