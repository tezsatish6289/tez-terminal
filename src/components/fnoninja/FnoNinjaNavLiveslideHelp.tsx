"use client";

import { CircleHelp } from "lucide-react";
import { useLiveslideWalkthrough } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

/** Liveslide in-app guide — nav icon, shown in slideshow views only. */
export function FnoNinjaNavLiveslideHelp() {
  const { open, levelsViewMode } = useLiveslideWalkthrough();

  if (levelsViewMode === "bubbles") return null;

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-colors shrink-0 hover:text-white"
      style={{
        color: "#94a3b8",
        border: "1px solid rgba(90,140,220,0.15)",
        backgroundColor: "rgba(37,99,235,0.06)",
      }}
      aria-label="Liveslide guide"
      title="Liveslide guide"
    >
      <CircleHelp className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
    </button>
  );
}
