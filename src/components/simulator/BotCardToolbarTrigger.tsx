"use client";

import { PowerOff, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COCKPIT_RAIL_ACTION_BTN } from "@/components/simulator/simulator-surfaces";
import type { CockpitBotPower } from "@/lib/cockpit-bot-status";

/**
 * Trading-mode lifecycle. Replaces the old binary AUTO/OFF pill so
 * an admin can put a bot in SIM_ONLY mode without taking it offline.
 *
 *   OFF       — bot is dormant. No sim entries, no live entries.
 *               Existing open trades still ride their own lifecycle.
 *   SIM_ONLY  — bot runs the simulator normally. New sim entries are
 *               NOT fanned out to live mirrors. Existing live mirrors
 *               continue their lifecycle (SL/TP/kill switch all
 *               cascade through). Use this to incubate a new bot
 *               (or pause new live exposure) without losing data.
 *   SIM_LIVE  — full production: new sim entries fan out to every
 *               user who's autoTradeEnabled AND opted-in for this bot.
 */
export type TradingMode = "OFF" | "SIM_ONLY" | "SIM_LIVE";

const SEGMENT_LABEL: Record<TradingMode, string> = {
  OFF: "Off",
  SIM_ONLY: "Sim",
  SIM_LIVE: "Live",
};

const SEGMENT_TITLE: Record<TradingMode, string> = {
  OFF: "Off — bot is dormant. No new sim trades or live entries.",
  SIM_ONLY: "Sim only — bot runs the simulator; new entries are NOT mirrored to live exchanges.",
  SIM_LIVE: "Sim + Live — production mode. New sim entries fan out to live mirrors.",
};

/** Config + tri-state trading-mode pill on heatmap cards. */
export function BotCardToolbarTrigger({
  tradingMode,
  power = "idle",
  sheetLabel = "Config",
  stacked = false,
  onConfigClick,
  onTradingModeChange,
}: {
  tradingMode: TradingMode;
  power?: CockpitBotPower;
  sheetLabel?: string;
  stacked?: boolean;
  onConfigClick?: (e: React.MouseEvent) => void;
  onTradingModeChange?: (next: TradingMode) => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      data-heatmap-toolbar=""
      className={cn(
        "flex shrink-0 relative z-10",
        stacked ? "flex-col gap-2.5 w-full" : "items-center gap-1",
      )}
      onClick={stop}
      onPointerDown={stop}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`${sheetLabel} settings`}
        onClick={(e) => {
          stop(e);
          onConfigClick?.(e);
        }}
        onPointerDown={stop}
        className={cn(
          stacked
            ? COCKPIT_RAIL_ACTION_BTN
            : cn(
                "flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#1a1a1f]",
                "px-2 py-1.5 hover:bg-[#222228] hover:border-white/[0.18] transition-all",
              ),
        )}
      >
        <Settings2 className={cn("w-3.5 h-3.5", stacked ? "text-accent" : "text-muted-foreground/55")} />
        {(stacked || sheetLabel) && (
          <span
            className={cn(
              stacked
                ? undefined
                : "text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50 hidden sm:inline",
            )}
          >
            {sheetLabel}
          </span>
        )}
      </button>

      <div
        role="group"
        aria-label="Trading mode"
        className={cn(
          "flex items-center overflow-hidden",
          stacked
            ? "w-full rounded-full border border-white/[0.1] bg-black/25 p-1 gap-0.5"
            : "rounded-lg border border-white/[0.12] bg-[#1a1a1f]",
        )}
      >
        {(["OFF", "SIM_ONLY", "SIM_LIVE"] as const).map((mode) => {
          const selected = tradingMode === mode;
          return (
            <button
              key={mode}
              type="button"
              title={SEGMENT_TITLE[mode]}
              aria-pressed={selected}
              onClick={(e) => {
                stop(e);
                if (!selected) onTradingModeChange?.(mode);
              }}
              onPointerDown={stop}
              className={cn(
                "flex items-center justify-center gap-1 font-black uppercase tracking-wider transition-all duration-200",
                stacked
                  ? "flex-1 rounded-full py-2 text-[9px]"
                  : "px-1.5 py-1.5 text-[8px]",
                selected
                  ? mode === "OFF"
                    ? stacked
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-rose-500/15 text-rose-300"
                    : mode === "SIM_ONLY"
                      ? stacked
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-amber-500/15 text-amber-300"
                      : stacked
                        ? cn(
                            "bg-emerald-500/25 text-emerald-200 border border-emerald-400/45",
                            "shadow-[0_0_20px_-6px_rgba(52,211,153,0.55)]",
                          )
                        : power === "on"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-emerald-500/10 text-emerald-300/80"
                  : stacked
                    ? "text-muted-foreground/40 hover:text-muted-foreground/65"
                    : "text-muted-foreground/45 hover:bg-white/[0.04] hover:text-muted-foreground/70",
              )}
            >
              {mode === "OFF" && <PowerOff className="w-3 h-3 shrink-0" />}
              {SEGMENT_LABEL[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
