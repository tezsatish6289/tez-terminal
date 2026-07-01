"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SrStoryReplayCanvas } from "@/components/sr-audit/SrStoryReplayCanvas";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import type { SrReplaySummary } from "@/lib/fnoninja/sr-replay-types";
import { FNO_CARD_BORDER, FNO_MUTED } from "@/lib/fnoninja/theme";

function useInView(rootMargin = "120px") {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

export function FnoNinjaSrReplayCard({
  summary,
  className = "",
}: {
  summary: SrReplaySummary;
  className?: string;
}) {
  const { ref, inView } = useInView();
  const [data, setData] = useState<StoryReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!inView || data || loading || error) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/fnoninja/sr-replays/story?id=${encodeURIComponent(summary.id)}`);
        if (!res.ok) throw new Error("load failed");
        const json = (await res.json()) as { replay?: StoryReplayData };
        if (!cancelled && json.replay) setData(json.replay);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, summary.id, data, loading, error]);

  const moveLabel = `${summary.movePct >= 0 ? "+" : ""}${summary.movePct.toFixed(1)}%`;

  return (
    <article ref={ref} className={`flex flex-col min-w-0 ${className}`.trim()}>
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-xl sm:rounded-2xl"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
      >
        {data ? (
          <SrStoryReplayCanvas data={data} autoPlay loop className="h-full" />
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs" style={{ color: FNO_MUTED }}>
            Replay unavailable
          </div>
        ) : (
          <div className="absolute inset-0 bg-white/[0.03]" aria-hidden />
        )}

        <span
          className="absolute top-2.5 left-2.5 z-10 rounded-md px-2 py-0.5 text-[10px] sm:text-[11px] font-bold font-mono pointer-events-none"
          style={{
            color: summary.side === "support" ? "#4ade80" : "#f87171",
            backgroundColor: "rgba(8,15,30,0.82)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {moveLabel}
        </span>
      </div>

      <h3 className="mt-3 text-sm sm:text-[15px] font-semibold text-white leading-snug line-clamp-2">
        {summary.symbol}
      </h3>
      <p className="mt-1 text-xs" style={{ color: FNO_MUTED }}>
        {summary.label}
        {summary.side === "support" ? " · Put wall bounce" : " · Call wall rejection"}
      </p>
    </article>
  );
}

export function FnoNinjaSrReplayCardCompact({ summary }: { summary: SrReplaySummary }) {
  return <FnoNinjaSrReplayCard summary={summary} className="max-w-[220px] sm:max-w-[240px]" />;
}
