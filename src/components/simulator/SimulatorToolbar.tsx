"use client";

import Link from "next/link";
import { BarChart3, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulatorState } from "@/lib/simulator";
import { SIM_CARD, SIM_PANEL } from "@/components/simulator/simulator-surfaces";

type AssetType = "CRYPTO" | "INDIAN_STOCKS";

const ASSETS: {
  key: AssetType;
  label: string;
  icon: string;
  fund: string;
}[] = [
  { key: "CRYPTO", label: "Crypto", icon: "₿", fund: "$1,000 USDT" },
  { key: "INDIAN_STOCKS", label: "Indian Stocks", icon: "₹", fund: "₹1,00,000" },
];

export function SimulatorToolbar({
  assetType,
  onAssetChange,
  simState,
  openCount,
  maxSlots,
  cs,
  lastRefreshedLabel,
  onRefresh,
  heatmapControl,
  paramsControl,
}: {
  assetType: AssetType;
  onAssetChange: (a: AssetType) => void;
  simState: SimulatorState | null;
  openCount: number;
  maxSlots: number;
  cs: string;
  lastRefreshedLabel: string;
  onRefresh: () => void;
  heatmapControl: React.ReactNode;
  paramsControl: React.ReactNode;
}) {
  const capital = simState?.capital;
  const slotsUsed = openCount;
  const slotsMax = maxSlots;

  return (
    <div className={cn(SIM_PANEL, "p-3 sm:p-4 space-y-3")}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
        {/* Asset switch */}
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.12] bg-[#0a0a0c] p-1 w-fit shrink-0 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
          {ASSETS.map(({ key, label, icon, fund }) => {
            const active = assetType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onAssetChange(key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-left transition-all",
                  active
                    ? "bg-accent text-black shadow-[0_4px_16px_rgba(0,212,170,0.35)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                )}
              >
                <span className="text-base font-bold">{icon}</span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[11px] sm:text-xs font-black uppercase tracking-wide">
                    {label}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-medium normal-case",
                      active ? "text-black/55" : "text-muted-foreground/45",
                    )}
                  >
                    {fund}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Live stats */}
        {simState && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <StatChip
              label="Capital"
              value={
                capital != null
                  ? `${cs}${capital.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "—"
              }
              accent
            />
            <StatChip
              label="Open"
              value={`${slotsUsed} / ${slotsMax}`}
              sub={slotsUsed === 0 ? "slots free" : slotsUsed >= slotsMax ? "full" : undefined}
            />
            {(simState.consecutiveWins ?? 0) >= 2 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {simState.consecutiveWins}× {simState.streakSide === "BUY" ? "bull" : "bear"} streak
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh state & open trades"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#1a1a1f] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:text-foreground hover:bg-[#222228] hover:border-white/[0.18] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline tabular-nums">{lastRefreshedLabel}</span>
          </button>
          <Link
            href="/stats"
            className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.12] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-accent shadow-[0_2px_12px_rgba(0,212,170,0.2)] hover:bg-accent/[0.18] transition-all"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Stats</span>
          </Link>
          {heatmapControl}
          {paramsControl}
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        SIM_CARD,
        "px-3 py-2 min-w-[88px]",
        accent && "border-accent/25 bg-[#141820] shadow-[0_6px_20px_-6px_rgba(0,212,170,0.15)]",
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/45 mb-0.5">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-black font-mono tabular-nums leading-none",
          accent ? "text-accent" : "text-foreground/90",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-muted-foreground/40 mt-0.5">{sub}</div>
      )}
    </div>
  );
}
