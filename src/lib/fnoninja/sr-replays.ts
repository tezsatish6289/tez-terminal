import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import {
  buildSrReplayTitle,
  parseSrReplaySort,
  type SrReplaySort,
  type SrReplaySummary,
} from "@/lib/fnoninja/sr-replay-types";
import { findSuccessStories } from "@/lib/videos/success-story";

export type SrReplayWithStory = SrReplaySummary & { replay: StoryReplayData };
export { buildSrReplayTitle };

function buildTitle(candidate: {
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
}): string {
  return buildSrReplayTitle(candidate);
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

/** Summaries plus candle replay payloads (for SSR / instant canvas play). */
export async function listSrReplaysWithStories(
  opts: { sort?: SrReplaySort; limit?: number } = {},
): Promise<SrReplayWithStory[]> {
  const summaries = await listSrReplaySummaries(opts);
  const loaded = await Promise.all(
    summaries.map(async (summary) => {
      const replay = await loadStoryReplayPayload(summary.id);
      if (!replay) return null;
      // Prefer chart-accurate MFE from the replay payload over stored sticky score.
      const movePct = replay.movePct;
      return {
        ...summary,
        movePct,
        title: buildTitle({ ...summary, movePct }),
        replay,
      };
    }),
  );
  const rows = loaded.filter((x): x is SrReplayWithStory => x != null);
  // sortSummaries preserves object identity (incl. replay payload).
  return sortSummaries(rows, opts.sort ?? "best") as SrReplayWithStory[];
}

export { parseSrReplaySort };
