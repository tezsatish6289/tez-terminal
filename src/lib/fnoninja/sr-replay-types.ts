import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";

/** Public SR-audit story replay summary for marketing surfaces. */
export type SrReplaySort = "best" | "latest" | "oldest";

export type SrReplaySummary = {
  id: string;
  title: string;
  symbol: string;
  label: string;
  side: "support" | "resistance";
  scope: "stock" | "index";
  movePct: number;
  eventAt: string;
};

/** Marketing carousel item with optional prefetched story payload. */
export type SrReplayWithStory = SrReplaySummary & { replay: StoryReplayData };

/** @deprecated Use SrReplaySummary — kept for transitional imports. */
export type SrReplayShort = SrReplaySummary;

export const SR_REPLAY_SORT_OPTIONS: { id: SrReplaySort; label: string }[] = [
  { id: "best", label: "Best" },
  { id: "latest", label: "Latest" },
  { id: "oldest", label: "Oldest" },
];

export function parseSrReplaySort(raw: string | null | undefined): SrReplaySort {
  if (raw === "latest" || raw === "oldest") return raw;
  return "best";
}

export function buildSrReplayTitle(candidate: {
  symbol: string;
  label?: string;
  side: "support" | "resistance";
  movePct: number;
}): string {
  const moveStr = `+${candidate.movePct.toFixed(1)}%`;
  const name = (candidate.label || candidate.symbol).trim() || candidate.symbol;
  if (candidate.side === "resistance") {
    return `${name} Call-Wall Rejection: ${moveStr} Move to Max Pain`;
  }
  return `${name} Put-Wall Bounce: ${moveStr} Move to Max Pain`;
}
