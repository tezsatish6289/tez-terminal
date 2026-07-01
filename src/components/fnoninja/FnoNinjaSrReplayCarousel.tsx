"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { FnoNinjaSrReplayCardCompact } from "@/components/fnoninja/FnoNinjaSrReplayCard";
import type { SrReplayShort } from "@/lib/fnoninja/sr-replay-types";
import { FNO_ACCENT_SOFT, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaSrReplayCarousel({ replays }: { replays: SrReplayShort[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

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
  }, [api]);

  if (replays.length === 0) {
    return (
      <p className="text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
        Real replay examples will appear here as new success stories are published.
      </p>
    );
  }

  return (
    <div className="relative">
      <Carousel setApi={setApi} opts={{ align: "start", dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3 sm:-ml-4">
          {replays.map((replay) => (
            <CarouselItem
              key={replay.id}
              className="pl-3 sm:pl-4 basis-[78%] sm:basis-[46%] md:basis-[34%] lg:basis-[26%] xl:basis-[22%]"
            >
              <FnoNinjaSrReplayCardCompact replay={replay} />
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
            className="absolute -left-1 sm:-left-3 top-[38%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30"
            aria-label="Previous replay"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={!canNext}
            className="absolute -right-1 sm:-right-3 top-[38%] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1b2e]/95 text-white/80 transition enabled:hover:text-white disabled:opacity-30"
            aria-label="Next replay"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}

      <div className="mt-8 sm:mt-10 flex justify-center">
        <Link
          href="/fnoninja/replays"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-7 py-3 text-sm font-bold transition-all hover:scale-105"
          style={{
            border: "1px solid rgba(90,140,220,0.22)",
            color: "#93c5fd",
            backgroundColor: FNO_ACCENT_SOFT,
          }}
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
