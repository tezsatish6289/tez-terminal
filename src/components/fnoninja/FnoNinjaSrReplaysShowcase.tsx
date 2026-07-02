"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { FnoNinjaSrReplayCardCompact } from "@/components/fnoninja/FnoNinjaSrReplayCard";
import { FnoNinjaSrReplaySort } from "@/components/fnoninja/FnoNinjaSrReplaySort";
import type { SrReplaySort } from "@/lib/fnoninja/sr-replay-types";
import type { SrReplayWithStory } from "@/lib/fnoninja/sr-replay-types";
import { replayColumnCount } from "@/lib/fnoninja/sr-replay-columns";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

function useReplayColumnCount(): number {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const update = () => setColumns(replayColumnCount(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}

export function FnoNinjaSrReplaysShowcase({
  initialReplays,
  initialSort = "best",
}: {
  initialReplays: SrReplayWithStory[];
  initialSort?: SrReplaySort;
}) {
  const [sort, setSort] = useState<SrReplaySort>(initialSort);
  const [replays, setReplays] = useState(initialReplays);
  const [loading, setLoading] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(0);
  const [windowStart, setWindowStart] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(() => new Set());
  const [api, setApi] = useState<CarouselApi>();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const columnCount = useReplayColumnCount();
  const isMultiColumn = columnCount > 1;
  const playingIndexRef = useRef(playingIndex);
  playingIndexRef.current = playingIndex;

  const resetPlayback = useCallback(() => {
    setPlayingIndex(0);
    setWindowStart(0);
    setCompletedIndices(new Set());
    api?.scrollTo(0, true);
  }, [api]);

  const fetchReplays = useCallback(async (nextSort: SrReplaySort) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/fnoninja/sr-replays?sort=${nextSort}&limit=12&withStory=1`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { replays?: SrReplayWithStory[] };
      if (res.ok && Array.isArray(json.replays)) {
        setReplays(json.replays);
        setPlayingIndex(0);
        setWindowStart(0);
        setCompletedIndices(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onSortChange = useCallback(
    (next: SrReplaySort) => {
      setSort(next);
      void fetchReplays(next);
    },
    [fetchReplays],
  );

  const handleCardComplete = useCallback(
    (index: number) => {
      if (index !== playingIndexRef.current || replays.length === 0) return;

      setCompletedIndices((prev) => {
        const nextCompleted = new Set(prev);
        nextCompleted.add(index);
        return nextCompleted;
      });

      const next = index + 1;
      if (next >= replays.length) {
        setPlayingIndex(0);
        setWindowStart(0);
        setCompletedIndices(new Set());
        api?.scrollTo(0, true);
        return;
      }

      setWindowStart((ws) => (next < ws + columnCount ? ws : next - columnCount + 1));
      setPlayingIndex(next);
    },
    [columnCount, replays.length],
  );

  useEffect(() => {
    resetPlayback();
  }, [initialReplays, columnCount, resetPlayback]);

  useEffect(() => {
    if (!api || replays.length === 0) return;
    api.scrollTo(windowStart, true);
  }, [api, windowStart, replays.length]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    onSelect();
    api.on("reInit", onSelect);
    api.on("select", onSelect);
    return () => {
      api.off("reInit", onSelect);
      api.off("select", onSelect);
    };
  }, [api, replays]);

  const carouselWrapperClass = isMultiColumn
    ? "relative w-full"
    : "relative max-w-[280px] sm:max-w-[300px] mx-auto";

  const itemBasisClass = isMultiColumn ? "pl-5 sm:pl-6 basis-[20%]" : "basis-full";

  return (
    <div className="relative">
      <div className="mb-8 sm:mb-10 flex flex-wrap items-center justify-between gap-4">
        <FnoNinjaSrReplaySort value={sort} onChange={onSortChange} />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: FNO_MUTED }} aria-label="Loading" />
        ) : null}
      </div>

      {replays.length === 0 && !loading ? (
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          Real replay examples will appear here once success stories have candle snapshots in SR
          zone audit.
        </p>
      ) : (
        <div className={carouselWrapperClass}>
          <Carousel
            setApi={setApi}
            opts={{ align: isMultiColumn ? "start" : "center", dragFree: isMultiColumn }}
            className="w-full"
          >
            <CarouselContent className={isMultiColumn ? "-ml-5 sm:-ml-6" : undefined}>
              {replays.map((replay, index) => (
                <CarouselItem key={replay.id} className={itemBasisClass}>
                  <FnoNinjaSrReplayCardCompact
                    summary={replay}
                    initialReplay={replay.replay}
                    isActive={index === playingIndex}
                    isCompleted={completedIndices.has(index)}
                    onComplete={() => handleCardComplete(index)}
                    fillWidth={isMultiColumn}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {replays.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => api?.scrollPrev()}
                disabled={!canPrev}
                className={`absolute ${isMultiColumn ? "left-0" : "-left-2 sm:-left-12"} top-[42%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30`}
                aria-label="Previous replay"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                disabled={!canNext}
                className={`absolute ${isMultiColumn ? "right-0" : "-right-2 sm:-right-12"} top-[42%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30`}
                aria-label="Next replay"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
