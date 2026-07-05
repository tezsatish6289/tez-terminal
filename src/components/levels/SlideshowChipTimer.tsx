"use client";

import { SlideshowTransportIcon } from "@/components/levels/SlideshowTransportIcon";
import { slideshowPauseShortHint } from "@/components/levels/SlideshowAutoPauseBanner";

/** Countdown / pause control embedded on the active slideshow symbol chip. */
export function SlideshowChipTimer({
  paused,
  secondsRemaining,
  pauseReason,
  canResume = true,
  accentColor = "#60a5fa",
  onToggle,
}: {
  paused: boolean;
  secondsRemaining: number;
  pauseReason?: string | null;
  canResume?: boolean;
  accentColor?: string;
  onToggle: () => void;
}) {
  const pausedColor = "#f472b6";
  const color = paused ? pausedColor : accentColor;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={paused && canResume === false}
      className="inline-flex items-center gap-0.5 shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-70 disabled:cursor-not-allowed"
      aria-label={
        paused
          ? pauseReason
            ? `Paused while viewing ${pauseReason}. Press P or click to resume.`
            : "Resume slideshow. Press P or click."
          : `Pause slideshow. ${Math.max(0, secondsRemaining)} seconds until next symbol. Press P or click.`
      }
      title={
        paused
          ? pauseReason
            ? canResume === false
              ? `Paused — ${slideshowPauseShortHint(pauseReason)}`
              : "Paused — return to Trend Chart"
            : "Play slideshow"
          : "Pause slideshow"
      }
      data-liveslide-tour="pause"
      data-favslide-tour="pause"
    >
      <SlideshowTransportIcon
        mode={paused ? "play" : "pause"}
        color={color}
        className="h-3.5 w-3.5 shrink-0"
      />
      <span
        className="text-[9px] font-bold tabular-nums leading-none uppercase"
        style={{ color }}
        aria-live="polite"
      >
        {paused
          ? pauseReason
            ? "Paused"
            : "Paused"
          : `${Math.max(0, secondsRemaining)}s`}
      </span>
    </button>
  );
}
