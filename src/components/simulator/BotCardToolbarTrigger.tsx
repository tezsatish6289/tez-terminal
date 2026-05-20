"use client";

import { forwardRef } from "react";
import { PowerOff, Settings2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CockpitBotPower } from "@/lib/cockpit-bot-status";

/** Config + AUTO/OFF on heatmap cards — Config opens sheet; Auto toggles override. */
export const BotCardToolbarTrigger = forwardRef<
  HTMLButtonElement,
  {
    isForcedOff: boolean;
    power?: CockpitBotPower;
    sheetLabel?: string;
    /** Toggle AUTO ↔ OFF without opening the config sheet. */
    onAutoToggle?: (e: React.MouseEvent) => void;
  }
>(function BotCardToolbarTrigger(
  { isForcedOff, power = "idle", sheetLabel = "Config", onAutoToggle },
  ref,
) {
  const autoColor = isForcedOff
    ? "bg-white/[0.04] text-muted-foreground/45 border-white/[0.08]"
    : power === "on"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-amber-500/10 text-amber-400/90 border-amber-500/25";

  return (
    <div
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#1a1a1f]",
          "px-2 py-1.5 hover:bg-[#222228] hover:border-white/[0.18] transition-all",
        )}
      >
        <Settings2 className="w-3.5 h-3.5 text-muted-foreground/55" />
        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50 hidden sm:inline">
          {sheetLabel}
        </span>
      </button>
      <button
        type="button"
        title={isForcedOff ? "Turn AUTO on" : "Force OFF"}
        onClick={onAutoToggle}
        className={cn(
          "flex items-center gap-0.5 px-1.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-wider transition-all",
          autoColor,
        )}
      >
        {isForcedOff ? (
          <PowerOff className="w-2.5 h-2.5" />
        ) : (
          <Zap className="w-2.5 h-2.5" />
        )}
        {isForcedOff ? "Off" : "Auto"}
      </button>
    </div>
  );
});

BotCardToolbarTrigger.displayName = "BotCardToolbarTrigger";
