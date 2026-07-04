"use client";

import { Eye, EyeOff } from "lucide-react";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";

/** Show/hide amber max-pain rings on the market bubbles map. */
export function LevelsMaxPainBubbleToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? Eye : EyeOff;
  const label = visible ? "Hide" : "Show";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex shrink-0 items-center gap-1 px-2 sm:px-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full border transition-colors active:scale-[0.98]`}
      style={{
        background: visible ? "rgba(120, 53, 15, 0.22)" : "rgba(22, 28, 42, 0.88)",
        borderColor: visible ? "rgba(245, 158, 11, 0.42)" : "rgba(148, 163, 184, 0.28)",
        color: visible ? "#fde68a" : "rgba(203, 213, 225, 0.88)",
      }}
      aria-pressed={visible}
      aria-label={
        visible
          ? "Hide max pain highlights on the bubble map"
          : "Show max pain highlights on the bubble map"
      }
      title={
        visible
          ? "Hide amber max pain rings — symbols stay on the map as grey bubbles"
          : "Show amber max pain rings on symbols parked at max pain"
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
    </button>
  );
}
