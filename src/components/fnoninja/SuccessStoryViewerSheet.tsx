"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SrStoryReplayCanvas } from "@/components/sr-audit/SrStoryReplayCanvas";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

export function SuccessStoryViewerSheet({
  storyId,
  open,
  onOpenChange,
}: {
  storyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<StoryReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !storyId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/fnoninja/sr-replays/story?id=${encodeURIComponent(storyId)}`,
        );
        if (!res.ok) throw new Error(res.status === 404 ? "Story not found" : "Failed to load");
        const json = (await res.json()) as { replay?: StoryReplayData };
        if (!cancelled) {
          if (json.replay) setData(json.replay);
          else setError("Story not found");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, storyId]);

  const title = data
    ? `${data.label || data.symbol} · +${data.movePct.toFixed(1)}%`
    : "Win story";

  const setup =
    data?.side === "support"
      ? "Put-wall bounce (support held)"
      : data?.side === "resistance"
        ? "Call-wall rejection (resistance held)"
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-0 overflow-hidden border-white/10 bg-[#0d1830] p-0 text-white sm:rounded-2xl"
        style={{ borderColor: "rgba(96,165,250,0.28)" }}
      >
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-white">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-slate-400">
            {setup ?? "Educational candle replay of a completed move to max pain."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative mx-5 aspect-[9/16] max-h-[min(62vh,520px)] overflow-hidden rounded-xl bg-black/40">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-400">
              {error}
            </div>
          ) : data ? (
            <SrStoryReplayCanvas data={data} active autoPlay loop showControls className="h-full" />
          ) : null}
        </div>

        {data ? (
          <div className="space-y-1.5 px-5 py-4 text-[13px] leading-relaxed text-slate-300">
            <p>
              Entered near ₹{fmt(data.entrySpot)}
              {data.maxPain != null ? ` → max pain ₹${fmt(data.maxPain)}` : ""}
              {` (+${data.movePct.toFixed(1)}%)`}.
            </p>
            <p className="text-[12px] text-slate-500">
              Educational recap only — not investment advice.
            </p>
          </div>
        ) : (
          <div className="px-5 py-4" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
