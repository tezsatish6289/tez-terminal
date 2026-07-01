"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { FnoNinjaSrReplayCardCompact } from "@/components/fnoninja/FnoNinjaSrReplayCard";
import { FnoNinjaSrReplaySort } from "@/components/fnoninja/FnoNinjaSrReplaySort";
import type { SrReplaySort } from "@/lib/fnoninja/sr-replay-types";
import type { SrReplayWithStory } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

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
        setActiveIndex(0);
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

  const advanceReplay = useCallback(() => {
    if (replays.length === 0) return;
    setActiveIndex((i) => (i + 1) % replays.length);
  }, [replays.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [initialReplays]);

  useEffect(() => {
    if (!api || replays.length === 0) return;
    api.scrollTo(activeIndex);
  }, [api, activeIndex, replays.length]);

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

  return (
    <div className="relative">
      <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-4">
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
        <>
          <Carousel setApi={setApi} opts={{ align: "start", dragFree: true }} className="w-full">
            <CarouselContent className="-ml-3 sm:-ml-4">
              {replays.map((replay, index) => (
                <CarouselItem
                  key={replay.id}
                  className="pl-3 sm:pl-4 basis-[78%] sm:basis-[46%] md:basis-[34%] lg:basis-[26%] xl:basis-[22%]"
                >
                  <FnoNinjaSrReplayCardCompact
                    summary={replay}
                    initialReplay={replay.replay}
                    isActive={index === activeIndex}
                    onComplete={advanceReplay}
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
                className="absolute -left-1 sm:-left-3 top-[42%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30"
                aria-label="Previous replay"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                disabled={!canNext}
                className="absolute -right-1 sm:-right-3 top-[42%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30"
                aria-label="Next replay"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
