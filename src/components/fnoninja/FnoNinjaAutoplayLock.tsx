"use client";

import { Lock, Pause, Play } from "lucide-react";
import { FNO_FAVSLIDE_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

type AutoplayVariant = "banner" | "rail" | "chip";

/**
 * Locked "Autoplay" control shown to Silver members inside Watchlist / Livelist.
 * Silver browses the list manually (next/prev); hands-free autoplay is a Gold
 * capability. Clicking surfaces the upgrade prompt — nothing is hidden.
 *
 * - `banner` (default): text + pill row, sits above the chart.
 * - `rail`: compact full-width pill, sits atop the symbol list so the relation
 *   to the list it would advance is obvious.
 */
export function FnoNinjaAutoplayLock({
  onUpgrade,
  variant = "banner",
}: {
  onUpgrade: () => void;
  variant?: AutoplayVariant;
}) {
  if (variant === "rail" || variant === "chip") {
    return (
      <button
        type="button"
        onClick={onUpgrade}
        className={
          variant === "chip"
            ? "inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors"
            : "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors"
        }
        style={{
          borderColor: "rgba(251,191,36,0.4)",
          background: "rgba(251,191,36,0.08)",
          color: FNO_FAVSLIDE_ACCENT,
        }}
        aria-label="Autoplay is a Gold feature — upgrade to unlock"
        title="Autoplay is a Gold feature — upgrade to unlock"
      >
        <Play className="h-3 w-3" fill={FNO_FAVSLIDE_ACCENT} strokeWidth={0} />
        {variant === "chip" ? "Auto" : "Autoplay"}
        <Lock className="h-3 w-3" strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-[11px] leading-snug sm:text-xs" style={{ color: FNO_MUTED }}>
        Manual mode — step through at your own pace.
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors"
        style={{
          borderColor: "rgba(251,191,36,0.4)",
          background: "rgba(251,191,36,0.08)",
          color: FNO_FAVSLIDE_ACCENT,
        }}
        aria-label="Autoplay is a Gold feature — upgrade to unlock"
        title="Autoplay is a Gold feature — upgrade to unlock"
      >
        <Play className="h-3 w-3" fill={FNO_FAVSLIDE_ACCENT} strokeWidth={0} />
        Autoplay
        <Lock className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Functional "Autoplay" on/off toggle shown to entitled members (Free trial /
 * Gold / Day Pass) inside Watchlist / Livelist. Mirrors the Silver lock's
 * placement and styling, but actually starts/pauses the 60s auto-advance.
 */
export function FnoNinjaAutoplayToggle({
  playing,
  onToggle,
  variant = "banner",
}: {
  playing: boolean;
  onToggle: () => void;
  variant?: AutoplayVariant;
}) {
  const accent = playing ? FNO_FAVSLIDE_ACCENT : FNO_MUTED;
  const borderColor = playing ? "rgba(251,191,36,0.5)" : "rgba(148,163,184,0.32)";
  const background = playing ? "rgba(251,191,36,0.12)" : "rgba(148,163,184,0.06)";
  const label = playing ? "Autoplay on" : "Autoplay off";
  const ariaLabel = playing
    ? "Autoplay is on — click to pause"
    : "Autoplay is off — click to play";
  const title = playing ? "Pause autoplay" : "Start autoplay";
  const Icon = playing ? Pause : Play;

  if (variant === "rail" || variant === "chip") {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={
          variant === "chip"
            ? "inline-flex h-10 max-w-[9.5rem] shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors"
            : "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors"
        }
        style={{ borderColor, background, color: accent }}
        aria-pressed={playing}
        aria-label={ariaLabel}
        title={title}
      >
        <Icon className="h-3 w-3" fill={accent} strokeWidth={0} />
        <span className="truncate">{variant === "chip" ? (playing ? "On" : "Off") : label}</span>
      </button>
    );
  }

  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-[11px] leading-snug sm:text-xs" style={{ color: FNO_MUTED }}>
        {playing
          ? "Autoplay on — advancing every 60s."
          : "Autoplay off — step through at your own pace."}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors"
        style={{ borderColor, background, color: accent }}
        aria-pressed={playing}
        aria-label={ariaLabel}
        title={title}
      >
        <Icon className="h-3 w-3" fill={accent} strokeWidth={0} />
        Autoplay
      </button>
    </div>
  );
}
