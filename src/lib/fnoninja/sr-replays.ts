import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import {
  parseSrReplaySort,
  type SrReplaySort,
  type SrReplaySummary,
} from "@/lib/fnoninja/sr-replay-types";
import { findSuccessStories } from "@/lib/videos/success-story";

function buildTitle(candidate: {
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
}): string {
  const moveStr = `+${candidate.movePct.toFixed(1)}%`;
  if (candidate.side === "resistance") {
    return `${candidate.symbol} Call-Wall Rejection: ${moveStr} Move to Max Pain`;
  }
  return `${candidate.symbol} Put-Wall Bounce: ${moveStr} Move to Max Pain`;
}

function sortSummaries(items: SrReplaySummary[], sort: SrReplaySort): SrReplaySummary[] {
  const copy = [...items];
  if (sort === "best") {
    copy.sort((a, b) => b.movePct - a.movePct || b.eventAt.localeCompare(a.eventAt));
  } else if (sort === "latest") {
    copy.sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  } else {
    copy.sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  }
  return copy;
}

/** Qualified SR success stories with candle snapshots — no render/social dependency. */
export async function listSrReplaySummaries(
  opts: { sort?: SrReplaySort; limit?: number } = {},
): Promise<SrReplaySummary[]> {
  const sort = opts.sort ?? "best";
  const limit = opts.limit ?? 48;
  const db = getAdminFirestore();

  const stories = await findSuccessStories(db, {
    withinDays: 365,
    scanLimit: 500,
    requireSnapshot: true,
  });

  const summaries: SrReplaySummary[] = stories.map((c) => ({
    id: c.id,
    title: buildTitle(c),
    symbol: c.symbol,
    label: c.label,
    side: c.side,
    scope: c.scope,
    movePct: c.movePct,
    eventAt: c.eventAt,
  }));

  return sortSummaries(summaries, sort).slice(0, limit);
}

export { parseSrReplaySort };
