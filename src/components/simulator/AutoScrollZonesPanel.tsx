"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { toPublicLevels } from "@/lib/public-levels";
import {
  ZonePriceLadder,
  formatHeroPrice,
} from "@/components/levels/ZonePriceLadder";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";

export interface ZoneCarouselItem {
  id: CockpitBotId;
  label: string;
  suggested: SuggestedZonesSnapshot | null;
  liveSpot: number | null;
}

/**
 * Auto-advancing zone carousel for the simulation cockpit — shows every
 * other bot's levels in the public ladder style while the selected bot
 * keeps the full Deribit detail ladder beside it.
 */
export function AutoScrollZonesPanel({
  items,
  intervalMs = 8000,
}: {
  items: ZoneCarouselItem[];
  intervalMs?: number;
}) {
  const playable = useMemo(
    () =>
      items.filter((item) => {
        const levels = toPublicLevels(item.suggested, item.liveSpot);
        return (
          levels != null &&
          (levels.bullLow != null || levels.bearLow != null)
        );
      }),
    [items],
  );

  const [slide, setSlide] = useState(0);
  const count = playable.length;
  const current = count > 0 ? Math.min(slide, count - 1) : 0;
  const item = count > 0 ? playable[current] : null;
  const levels = item ? toPublicLevels(item.suggested, item.liveSpot) : null;
  const spot = levels?.spot ?? null;

  useEffect(() => {
    setSlide(0);
  }, [items]);

  useEffect(() => {
    if (count <= 1) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % count), intervalMs);
    return () => clearTimeout(id);
  }, [current, count, intervalMs]);

  const go = (dir: number) =>
    setSlide((s) => (count > 0 ? (s + dir + count) % count : 0));

  if (count === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-8 min-h-[280px]">
        <p className="text-[10px] text-muted-foreground/40 text-center">
          No other zone snapshots yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-[280px] min-w-0">
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.06] shrink-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/50">
          Auto-scrolling zones
        </p>
        <p className="text-sm font-black text-white truncate mt-0.5">
          {item!.label}
        </p>
        {spot != null && (
          <p className="text-lg font-black font-mono tabular-nums text-amber-300/95 mt-0.5">
            {formatHeroPrice(spot, "$")}
          </p>
        )}
      </div>

      <div className="relative flex-1 flex flex-col justify-center min-h-0 px-1 sm:px-2 py-2">
        {levels && (
          <ZonePriceLadder
            levels={levels}
            spot={spot}
            currencySymbol="$"
            variant="embedded"
          />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous zone"
              className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center justify-center h-7 w-7 rounded-full border border-white/10 bg-black/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next zone"
              className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center justify-center h-7 w-7 rounded-full border border-white/10 bg-black/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-2 shrink-0">
          {playable.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setSlide(i)}
              aria-label={`Show ${it.label} zones`}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === current ? 16 : 6,
                backgroundColor:
                  i === current ? "#3b82f6" : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
