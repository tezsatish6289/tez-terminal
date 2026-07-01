import {
  countBubbleMapFilters,
  type BubbleMapFilter,
} from "@/lib/zones/bubble-map-filter";
import type { BubbleTone } from "@/lib/zones/bubble-tone";

/** Showcase order on the landing-page hero embed. */
export const BUBBLE_SHOWCASE_KEYS = [
  "IN_BULL",
  "NEAR_BULL",
  "IN_BEAR",
  "NEAR_BEAR",
] as const;

export type BubbleShowcaseKey = (typeof BUBBLE_SHOWCASE_KEYS)[number];

export function bubbleShowcaseSteps(
  items: readonly { tone: BubbleTone }[],
): BubbleShowcaseKey[] {
  const counts = countBubbleMapFilters(items);
  return BUBBLE_SHOWCASE_KEYS.filter((key) => counts[key] > 0);
}

export function runBubbleShowcaseCycle(
  steps: BubbleShowcaseKey[],
  onPhase: (phase: BubbleMapFilter) => void,
  options?: { allMs?: number; highlightMs?: number },
): () => void {
  if (steps.length === 0) return () => {};

  const allMs = options?.allMs ?? 3200;
  const highlightMs = options?.highlightMs ?? 4200;
  let cancelled = false;
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(() => {
        if (!cancelled) resolve();
      }, ms);
      timeouts.push(t);
    });

  void (async () => {
    if (steps.length === 1) {
      // One active filter: brief full-map intro, then settle — no all↔highlight loop.
      onPhase("all");
      await sleep(allMs);
      if (cancelled) return;
      onPhase(steps[0]!);
      return;
    }

    while (!cancelled) {
      onPhase("all");
      await sleep(allMs);
      if (cancelled) break;
      for (const key of steps) {
        if (cancelled) break;
        onPhase(key);
        await sleep(highlightMs);
      }
    }
  })();

  return () => {
    cancelled = true;
    for (const t of timeouts) window.clearTimeout(t);
  };
}
