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
  variant = "inline",
  footerBg,
  footerBorder,
}: {
  paused: boolean;
  secondsRemaining: number;
  pauseReason?: string | null;
  canResume?: boolean;
  accentColor?: string;
  onToggle: () => void;
  /** Footer spans chip width — used on the active liveslide/favslide tile. */
  variant?: "inline" | "footer";
  footerBg?: string;
  footerBorder?: string;
}) {
  const pausedColor = "#f472b6";
  const color = paused ? pausedColor : accentColor;
  const footer = variant === "footer";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={paused && canResume === false}
      className={
        footer
          ? "flex w-full items-center justify-center gap-2 min-h-[1.875rem] px-2 py-1.5 transition-colors hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed border-t"
          : "inline-flex items-center gap-0.5 shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-70 disabled:cursor-not-allowed"
      }
      style={
        footer
          ? {
              backgroundColor: paused
                ? "rgba(244,114,182,0.12)"
                : (footerBg ?? "rgba(255,255,255,0.06)"),
              borderColor: paused
                ? "rgba(244,114,182,0.28)"
                : (footerBorder ?? "rgba(255,255,255,0.1)"),
            }
          : undefined
      }
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
        className={footer ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}
      />
      <span
        className={
          footer
            ? "text-[11px] font-black tabular-nums leading-none uppercase tracking-wide"
            : "text-[9px] font-bold tabular-nums leading-none uppercase"
        }
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
