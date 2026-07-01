"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FnoNinjaSrReplayCard } from "@/components/fnoninja/FnoNinjaSrReplayCard";
import { FnoNinjaSrReplaySort } from "@/components/fnoninja/FnoNinjaSrReplaySort";
import {
  parseSrReplaySort,
  type SrReplaySort,
} from "@/lib/fnoninja/sr-replay-types";
import type { SrReplayWithStory } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaReplaysGallery({
  initialReplays,
  initialSort = "best",
}: {
  initialReplays: SrReplayWithStory[];
  initialSort?: SrReplaySort;
}) {
  const searchParams = useSearchParams();
  const urlSort = parseSrReplaySort(searchParams.get("sort") ?? initialSort);
  const [sort, setSort] = useState<SrReplaySort>(urlSort);
  const [replays, setReplays] = useState(initialReplays);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchReplays = useCallback(async (nextSort: SrReplaySort) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/fnoninja/sr-replays?sort=${nextSort}&limit=100&withStory=1`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { replays?: SrReplayWithStory[] };
      if (res.ok && Array.isArray(json.replays)) {
        setReplays(json.replays);
        setActiveIndex(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const advanceReplay = useCallback(() => {
    if (replays.length === 0) return;
    setActiveIndex((i) => (i + 1) % replays.length);
  }, [replays.length]);

  useEffect(() => {
    const next = parseSrReplaySort(searchParams.get("sort"));
    if (next !== sort) {
      setSort(next);
      void fetchReplays(next);
    }
  }, [searchParams, sort, fetchReplays]);

  const onSortChange = useCallback(
    (next: SrReplaySort) => {
      setSort(next);
      const url = new URL(window.location.href);
      url.searchParams.set("sort", next);
      window.history.replaceState(null, "", url.toString());
      void fetchReplays(next);
    },
    [fetchReplays],
  );

  return (
    <>
      <div className="mb-8 sm:mb-10 flex flex-wrap items-center gap-4">
        <FnoNinjaSrReplaySort value={sort} onChange={onSortChange} />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: FNO_MUTED }} aria-label="Loading" />
        ) : null}
      </div>

      {replays.length === 0 && !loading ? (
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          No replayable success stories yet. Stories need a stored candle snapshot in SR zone audit.
        </p>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 sm:gap-5 [column-fill:balance]">
          {replays.map((replay, index) => (
            <div key={replay.id} className="mb-4 sm:mb-5 break-inside-avoid">
              <FnoNinjaSrReplayCard
                summary={replay}
                initialReplay={replay.replay}
                isActive={index === activeIndex}
                onComplete={advanceReplay}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
