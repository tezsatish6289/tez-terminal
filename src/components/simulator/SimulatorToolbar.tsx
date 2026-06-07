"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulatorState } from "@/lib/simulator";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";

/** Global cockpit controls — streak is shared; tune params are global. */
export function SimulatorToolbar({
  simState,
  lastRefreshedLabel,
  onRefresh,
  paramsControl,
}: {
  simState: SimulatorState | null;
  lastRefreshedLabel: string;
  onRefresh: () => void;
  paramsControl: React.ReactNode;
}) {
  const streakActive = (simState?.consecutiveWins ?? 0) >= 2;

  return (
    <div className={cn(SIM_PANEL, "shrink-0 px-3 py-2 sm:px-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <h1 className="text-xs font-black uppercase tracking-wide text-foreground/90 whitespace-nowrap">
            Simulator
          </h1>
          <Link
            href="/stats"
            className="text-[9px] text-muted-foreground/45 hover:text-accent transition-colors whitespace-nowrap"
          >
            Stats →
          </Link>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
          {streakActive && simState && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 shadow-[0_2px_10px_rgba(16,185,129,0.12)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {simState.consecutiveWins}× {simState.streakSide === "BUY" ? "bull" : "bear"}{" "}
              streak · all bots
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh state & open trades"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#1a1a1f] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:text-foreground hover:bg-[#222228] hover:border-white/[0.18] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline tabular-nums">{lastRefreshedLabel}</span>
          </button>
          {paramsControl}
        </div>
      </div>
    </div>
  );
}
