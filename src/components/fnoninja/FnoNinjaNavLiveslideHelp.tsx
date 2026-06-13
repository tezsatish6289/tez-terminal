"use client";

import { CircleHelp } from "lucide-react";
import { useLiveslideWalkthrough } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";
import { FNO_FAVSLIDE_ACCENT, FNO_LIVESLIDE_ACCENT } from "@/lib/fnoninja/theme";

/** In-app slideshow guide — nav icon, shown in liveslide and favslide only. */
export function FnoNinjaNavLiveslideHelp() {
  const { open, levelsViewMode } = useLiveslideWalkthrough();

  if (levelsViewMode === "bubbles") return null;

  const isFav = levelsViewMode === "favslide";
  const label = isFav ? "Favslide guide" : "Liveslide guide";
  const accent = isFav ? FNO_FAVSLIDE_ACCENT : FNO_LIVESLIDE_ACCENT;

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-colors shrink-0 hover:text-white"
      style={{
        color: isFav ? accent : "#94a3b8",
        border: `1px solid ${isFav ? "rgba(251,191,36,0.25)" : "rgba(90,140,220,0.15)"}`,
        backgroundColor: isFav ? "rgba(251,191,36,0.08)" : "rgba(37,99,235,0.06)",
      }}
      aria-label={label}
      title={label}
    >
      <CircleHelp className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
    </button>
  );
}
