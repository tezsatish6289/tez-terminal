"use client";

import { Lock, Pause, Play } from "lucide-react";
import { FNO_FAVSLIDE_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

/**
 * Locked "Autoplay" control shown to Silver members inside Watchlist / Livelist.
 * Silver browses the list manually (next/prev); hands-free autoplay is a Gold
 * capability. Clicking surfaces the upgrade prompt — nothing is hidden.
 */
export function FnoNinjaAutoplayLock({ onUpgrade }: { onUpgrade: () => void }) {
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
}: {
  playing: boolean;
  onToggle: () => void;
}) {
  const accent = playing ? FNO_FAVSLIDE_ACCENT : FNO_MUTED;
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
        style={{
          borderColor: playing ? "rgba(251,191,36,0.5)" : "rgba(148,163,184,0.32)",
          background: playing ? "rgba(251,191,36,0.12)" : "rgba(148,163,184,0.06)",
          color: accent,
        }}
        aria-pressed={playing}
        aria-label={playing ? "Autoplay is on — click to pause" : "Autoplay is off — click to play"}
        title={playing ? "Pause autoplay" : "Start autoplay"}
      >
        {playing ? (
          <Pause className="h-3 w-3" fill={accent} strokeWidth={0} />
        ) : (
          <Play className="h-3 w-3" fill={accent} strokeWidth={0} />
        )}
        Autoplay
      </button>
    </div>
  );
}
