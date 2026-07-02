"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { SrStoryReplayCanvas } from "@/components/sr-audit/SrStoryReplayCanvas";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import type { SrReplaySummary } from "@/lib/fnoninja/sr-replay-types";
import { FNO_CARD_BORDER, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaSrReplayCard({
  summary,
  initialReplay = null,
  isActive = false,
  isCompleted = false,
  onComplete,
  className = "",
}: {
  summary: SrReplaySummary;
  /** SSR-prefetched story — skips client fetch when present. */
  initialReplay?: StoryReplayData | null;
  /** When true, plays the canvas replay once. */
  isActive?: boolean;
  /** When true, shows the finished frame (marketing row fill). */
  isCompleted?: boolean;
  onComplete?: () => void;
  className?: string;
}) {
  const [data, setData] = useState<StoryReplayData | null>(initialReplay);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(!!initialReplay);

  useEffect(() => {
    setData(initialReplay);
    setError(false);
    setLoading(false);
    fetchedRef.current = !!initialReplay;
  }, [summary.id, initialReplay]);

  useEffect(() => {
    if (data || error || fetchedRef.current) return;

    let cancelled = false;
    fetchedRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/fnoninja/sr-replays/story?id=${encodeURIComponent(summary.id)}`);
        if (!res.ok) throw new Error("load failed");
        const json = (await res.json()) as { replay?: StoryReplayData };
        if (!cancelled && json.replay) {
          setData(json.replay);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [summary.id, data, error]);

  return (
    <article
      className={`flex flex-col min-w-0 ${className}`.trim()}
      aria-label={`${summary.symbol} ${summary.side === "support" ? "put wall bounce" : "call wall rejection"} replay`}
    >
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-xl sm:rounded-2xl"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
      >
        {data && isActive ? (
          <SrStoryReplayCanvas
            data={data}
            active
            loop={false}
            onComplete={onComplete}
            className="h-full"
          />
        ) : data && isCompleted ? (
          <SrStoryReplayCanvas data={data} active={false} loop={false} className="h-full" />
        ) : data ? (
          <div
            className="absolute inset-0 flex items-center justify-center opacity-35"
            aria-hidden
          >
            <FnoNinjaLogo size={40} wordmarkClassName="text-sm" />
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />
          </div>
        ) : error ? (
          <div
            className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs"
            style={{ color: FNO_MUTED }}
          >
            Replay unavailable
          </div>
        ) : (
          <div className="absolute inset-0 bg-white/[0.03]" aria-hidden />
        )}
      </div>
    </article>
  );
}

export function FnoNinjaSrReplayCardCompact({
  summary,
  initialReplay = null,
  isActive = false,
  isCompleted = false,
  onComplete,
  fillWidth = false,
}: {
  summary: SrReplaySummary;
  initialReplay?: StoryReplayData | null;
  isActive?: boolean;
  isCompleted?: boolean;
  onComplete?: () => void;
  /** Fill carousel column on desktop multi-column row. */
  fillWidth?: boolean;
}) {
  return (
    <FnoNinjaSrReplayCard
      summary={summary}
      initialReplay={initialReplay}
      isActive={isActive}
      isCompleted={isCompleted}
      onComplete={onComplete}
      className={
        fillWidth
          ? "w-full max-w-[220px] sm:max-w-[240px] mx-auto lg:max-w-none lg:mx-0"
          : "w-full max-w-[220px] sm:max-w-[240px] mx-auto"
      }
    />
  );
}
