"use client";

import { Lock, Play } from "lucide-react";
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
