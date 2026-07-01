"use client";

import { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { SrReplayShort } from "@/lib/fnoninja/sr-replay-types";
import { FNO_CARD_BORDER, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaSrReplayCard({
  replay,
  className = "",
}: {
  replay: SrReplayShort;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const moveLabel =
    replay.movePct != null && Number.isFinite(replay.movePct)
      ? `${replay.movePct >= 0 ? "+" : ""}${replay.movePct.toFixed(1)}%`
      : null;

  return (
    <article className={`group flex flex-col min-w-0 ${className}`.trim()}>
      <button
        type="button"
        onClick={togglePlay}
        className="relative aspect-[9/16] w-full overflow-hidden rounded-xl sm:rounded-2xl text-left"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
        aria-label={`Play ${replay.title}`}
      >
        <video
          ref={videoRef}
          src={replay.videoUrl}
          className="absolute inset-0 h-full w-full object-cover"
          preload="metadata"
          playsInline
          loop
          muted={!playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {!playing ? (
          <span
            className="absolute inset-0 flex items-center justify-center bg-black/25 transition-opacity"
            aria-hidden
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(37,99,235,0.85)" }}
            >
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </span>
          </span>
        ) : null}

        {moveLabel ? (
          <span
            className="absolute top-2.5 left-2.5 rounded-md px-2 py-0.5 text-[10px] sm:text-[11px] font-bold font-mono"
            style={{
              color: replay.side === "support" ? "#4ade80" : "#f87171",
              backgroundColor: "rgba(8,15,30,0.82)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {moveLabel}
          </span>
        ) : null}
      </button>

      <h3 className="mt-3 text-sm sm:text-[15px] font-semibold text-white leading-snug line-clamp-2">
        {replay.title}
      </h3>
      <p className="mt-1 text-xs" style={{ color: FNO_MUTED }}>
        {replay.label}
        {replay.side === "support" ? " · Put wall bounce" : " · Call wall rejection"}
      </p>
    </article>
  );
}

export function FnoNinjaSrReplayCardCompact({ replay }: { replay: SrReplayShort }) {
  return (
    <FnoNinjaSrReplayCard
      replay={replay}
      className="max-w-[220px] sm:max-w-[240px]"
    />
  );
}
