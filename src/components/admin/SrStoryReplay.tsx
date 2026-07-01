"use client";

import { Loader2, X } from "lucide-react";
import { SrStoryReplayCanvas } from "@/components/sr-audit/SrStoryReplayCanvas";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";

export type { StoryReplayData, StoryBar } from "@/lib/sr-audit/story-replay-types";

export function SrStoryReplay({
  data,
  loading,
  onClose,
}: {
  data: StoryReplayData | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.88)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border flex flex-col"
        style={{
          borderColor: "rgba(255,255,255,0.1)",
          background: "#0b1220",
          maxHeight: "94vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
            Story reel · 9:16
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 flex items-center justify-center overflow-auto">
          {loading ? (
            <div
              className="flex items-center justify-center text-slate-500"
              style={{ width: 360, height: 640 }}
            >
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || !data.candles.length ? (
            <div
              className="flex items-center justify-center text-center text-slate-500 text-sm px-8"
              style={{ width: 360, height: 640 }}
            >
              No candle snapshot stored for this event yet. Snapshots are captured once an event
              reaches max pain (and while the move is still inside the 30-day candle window).
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden shadow-2xl"
              style={{ width: "min(420px, 86vw)" }}
            >
              <SrStoryReplayCanvas data={data} autoPlay loop showControls />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
