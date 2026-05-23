"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SIM_CARD } from "@/components/simulator/simulator-surfaces";
import {
  deriveCockpitCardStatus,
  type CockpitCardStatus,
} from "@/lib/cockpit-card-status";
import {
  formatIvExplainer,
  formatSpot,
  spotFromSuggested,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";

/**
 * One row in the cockpit's left rail (master-detail layout).
 *
 * Carries only the at-a-glance fields you need to decide "do I click into
 * this bot?" — title + mode, spot + IV, status pill + one-line reason,
 * capital + live count + Δ since start. The full detail card on the right
 * pane shows everything else (zone tiles, max-pain table, settings).
 */
export interface CockpitCompactRowProps {
  botId: CockpitBotId;
  label: string;
  suggested: SuggestedZonesSnapshot | null;
  manualOverride: string | null;
  engineReason: string | null;
  engineDirection: ZoneBotDirection | null;
  /** Crypto Bot only — macro gate simEnabled */
  simEnabled?: boolean | null;
  botEngineLive: boolean;
  liveCount: number;
  closedCount: number;
  selected: boolean;
  onSelect: () => void;
}

const POWER_DOT: Record<CockpitCardStatus["power"], string> = {
  on: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]",
  idle: "bg-amber-300/90 shadow-[0_0_8px_rgba(252,211,77,0.45)]",
  off: "bg-rose-400/90 shadow-[0_0_8px_rgba(251,113,133,0.45)]",
};

const ASSET_TAG: Record<CockpitBotId, string> = {
  crypto: "BTC",
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
  xrp: "XRP",
};

export function CockpitCompactRow({
  botId,
  label,
  suggested,
  manualOverride,
  engineReason,
  engineDirection,
  simEnabled,
  botEngineLive,
  liveCount,
  closedCount,
  selected,
  onSelect,
}: CockpitCompactRowProps) {
  const cardStatus = useMemo(
    () =>
      deriveCockpitCardStatus({
        botId,
        suggested,
        manualOverride,
        engineReason,
        engineDirection,
        simEnabled,
        botEngineLive,
        liveCount,
      }),
    [
      botId,
      suggested,
      manualOverride,
      engineReason,
      engineDirection,
      simEnabled,
      botEngineLive,
      liveCount,
    ],
  );

  const spot = spotFromSuggested(suggested);
  const ivPct = suggested?.atmIV != null ? suggested.atmIV * 100 : null;

  // Status hover title — the dot is now the only status cue on the row,
  // so the full headline+detail moves into the tooltip for users who
  // want the reason without clicking into the detail card. The same
  // reason text is also rendered on the right pane's header so the
  // info isn't lost — see HeatmapAssetCard.
  const statusTitle = [cardStatus.bucketLabel, cardStatus.headline, cardStatus.detail]
    .filter(Boolean)
    .join(" — ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${label} — ${statusTitle}`}
      title={statusTitle}
      className={cn(
        SIM_CARD,
        "w-full text-left px-3 py-2.5 space-y-1.5 transition-all",
        selected
          ? "ring-2 ring-accent/80 shadow-[0_0_0_1px_rgba(0,212,170,0.25),0_8px_24px_rgba(0,212,170,0.12)]"
          : "hover:ring-1 hover:ring-white/15 hover:border-white/[0.18]",
      )}
    >
      {/* Row 1 — status dot + title. The dot replaces the old AUTO/OFF
          mode badge: green = ready/trading, amber = waiting, rose = off
          (manual OFF, panic regime, no data, etc.). The reason text
          moved to the right-pane detail card. */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "shrink-0 inline-block w-2 h-2 rounded-full",
            POWER_DOT[cardStatus.power],
          )}
          aria-hidden
        />
        <span className="text-[12px] font-black tracking-tight truncate text-foreground/95">
          {label}
        </span>
      </div>

      {/* Row 2 — price + IV */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-mono font-bold tabular-nums text-foreground/90 leading-none">
          ${formatSpot(spot)}
        </span>
        {ivPct != null && (
          <span
            className="text-[9px] font-mono font-bold text-muted-foreground/55 tabular-nums cursor-help"
            title={formatIvExplainer(ivPct, spot, ASSET_TAG[botId])}
          >
            IV {ivPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Row 3 — live trades focus (the field a trader actually scans for) */}
      <div className="flex items-center justify-between gap-2">
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-accent/35 bg-accent/[0.12] text-[9px] font-black uppercase tracking-wider text-accent">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {liveCount} live {liveCount === 1 ? "trade" : "trades"}
          </span>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/45">
            No live trades
          </span>
        )}
        <span className="text-[9px] font-mono text-muted-foreground/45 tabular-nums">
          {closedCount} closed
        </span>
      </div>
    </button>
  );
}
