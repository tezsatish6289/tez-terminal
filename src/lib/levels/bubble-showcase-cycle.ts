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

/** Signed-out /levels — auto-demo filter chip order (matches toolbar labels). */
export const GUEST_LEVELS_FILTER_CYCLE_KEYS = [
  "BULLISH",
  "BEARISH",
  "IN_BULL",
  "NEAR_BULL",
  "IN_BEAR",
  "NEAR_BEAR",
  "AT_POC",
] as const satisfies readonly Exclude<BubbleMapFilter, "all" | "UNSCANNED">[];

export type GuestLevelsFilterCycleKey = (typeof GUEST_LEVELS_FILTER_CYCLE_KEYS)[number];

export function bubbleShowcaseSteps(
  items: readonly { tone: BubbleTone }[],
): BubbleShowcaseKey[] {
  const counts = countBubbleMapFilters(items);
  return BUBBLE_SHOWCASE_KEYS.filter((key) => counts[key] > 0);
}

/** Filters with at least one symbol — guest map auto-cycle skips empty chips. */
export function guestBubbleFilterSteps(
  items: readonly { tone: BubbleTone }[],
): GuestLevelsFilterCycleKey[] {
  const counts = countBubbleMapFilters(items);
  return GUEST_LEVELS_FILTER_CYCLE_KEYS.filter((key) => counts[key] > 0);
}

export function runBubbleMapFilterCycle(
  steps: BubbleMapFilter[],
  onPhase: (phase: BubbleMapFilter) => void,
  options?: { allMs?: number; highlightMs?: number; loopOnce?: boolean },
): () => void {
  if (steps.length === 0) return () => {};

  const allMs = options?.allMs ?? 3200;
  const highlightMs = options?.highlightMs ?? 4200;
  const loopOnce = options?.loopOnce ?? false;
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
    const runRound = async (): Promise<boolean> => {
      onPhase("all");
      await sleep(allMs);
      if (cancelled) return false;
      for (const key of steps) {
        if (cancelled) return false;
        onPhase(key);
        await sleep(highlightMs);
      }
      return true;
    };

    if (steps.length === 1) {
      onPhase("all");
      await sleep(allMs);
      if (cancelled) return;
      onPhase(steps[0]!);
      if (loopOnce) {
        await sleep(highlightMs);
        if (!cancelled) onPhase("all");
      }
      return;
    }

    if (loopOnce) {
      const completed = await runRound();
      if (!cancelled && completed) onPhase("all");
      return;
    }

    while (!cancelled) {
      const completed = await runRound();
      if (cancelled || !completed) break;
    }
  })();

  return () => {
    cancelled = true;
    for (const t of timeouts) window.clearTimeout(t);
  };
}

export function runBubbleShowcaseCycle(
  steps: BubbleShowcaseKey[],
  onPhase: (phase: BubbleMapFilter) => void,
  options?: { allMs?: number; highlightMs?: number },
): () => void {
  return runBubbleMapFilterCycle(steps, onPhase, options);
}
