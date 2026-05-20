"use client";

import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  formatSpot,
  spotFromSuggested,
  zoneStatusLine,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";
import { SIM_CARD, SIM_INSET_TILE } from "@/components/simulator/simulator-surfaces";
import type { CockpitBotStatus } from "@/lib/cockpit-bot-status";

export function HeatmapAssetCard({
  botId,
  label,
  suggested,
  botStatus,
  capital,
  openCount,
  cs,
  settingsSlot,
}: {
  botId: CockpitBotId;
  label: string;
  suggested: SuggestedZonesSnapshot | null;
  botStatus: CockpitBotStatus;
  capital: number;
  openCount: number;
  cs: string;
  settingsSlot?: React.ReactNode;
}) {
  const spot = spotFromSuggested(suggested);
  const ivPct = suggested?.atmIV != null ? suggested.atmIV * 100 : null;
  const status = zoneStatusLine(suggested);
  const day0Pain = suggested?.maxPainByExpiry?.find((e) => e.dayIndex === 0);

  const bothDead =
    suggested?.bullActionable === false && suggested?.bearActionable === false;
  const statusColor =
    suggested?.signalConflict || suggested?.insufficientGap
      ? "text-amber-400"
      : suggested?.inPanicRegime
        ? "text-rose-400"
        : bothDead
          ? "text-muted-foreground/50"
          : "text-emerald-400/90";

  return (
    <div className={cn(SIM_CARD, "overflow-hidden flex flex-col min-h-[220px]")}>
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-white/[0.1] bg-[#1c1c21] flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black tracking-tight">{label}</span>
            {botId === "crypto" && (
              <span className="text-[8px] font-bold uppercase tracking-wider text-accent/70 px-1.5 py-0.5 rounded border border-accent/25 bg-accent/10">
                BTC Deribit
              </span>
            )}
            {ivPct != null && (
              <span
                className={cn(
                  "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border",
                  ivPct >= 70
                    ? "border-rose-500/30 text-rose-300 bg-rose-500/10"
                    : ivPct >= 50
                      ? "border-amber-500/30 text-amber-200 bg-amber-500/10"
                      : "border-emerald-500/25 text-emerald-300/90 bg-emerald-500/5",
                )}
              >
                IV {ivPct.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono font-bold text-foreground/80 mt-0.5">
            ${formatSpot(spot)}
          </p>
          <p className={cn("text-[10px] font-bold mt-1", statusColor)}>{status}</p>
          <BotPowerBadge status={botStatus} />
        </div>
        {settingsSlot}
      </div>

      <div className="px-3.5 py-2 border-b border-white/[0.08] bg-[#141418] grid grid-cols-2 gap-2">
        <BotStatChip
          label="Capital"
          value={`${cs}${capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          accent
        />
        <BotStatChip
          label="Open"
          value={String(openCount)}
          sub={openCount === 1 ? "position" : "positions"}
        />
      </div>

      {!suggested ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-[10px] text-muted-foreground/40">Refresh zones to load</p>
        </div>
      ) : (
        <div className="flex-1 p-3 space-y-2.5">
          {(suggested.signalConflict || suggested.insufficientGap) && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/[0.1] px-2 py-1.5 shadow-[0_2px_10px_rgba(251,191,36,0.12)]">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-300/80 leading-snug">
                {suggested.signalConflict
                  ? "Day 0 / Day 1 max pain disagree"
                  : "Bull & bear zones too tight"}
              </p>
            </div>
          )}

          {day0Pain && (
            <div className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg bg-accent/[0.1] border border-accent/25 shadow-[0_2px_8px_rgba(0,212,170,0.1)]">
              <span className="text-[9px] font-bold uppercase tracking-wider text-accent/60">
                Max pain (today)
              </span>
              <span className="font-mono font-bold text-accent">
                ${day0Pain.maxPain.toLocaleString()}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <ZoneSide
              side="bull"
              strike={suggested.bullStrike}
              low={suggested.bullZoneLow}
              high={suggested.bullZoneHigh}
              tp={suggested.bullTpTarget}
              tpConf={suggested.bullTpConfidence}
              actionable={suggested.bullActionable}
            />
            <ZoneSide
              side="bear"
              strike={suggested.bearStrike}
              low={suggested.bearZoneLow}
              high={suggested.bearZoneHigh}
              tp={suggested.bearTpTarget}
              tpConf={suggested.bearTpConfidence}
              actionable={suggested.bearActionable}
            />
          </div>

          {suggested.halfWidthUsd != null && (
            <p className="text-[9px] text-center text-muted-foreground/35 font-mono">
              ±${Math.round(suggested.halfWidthUsd)} half-width
              {suggested.computedAt && (
                <>
                  {" · "}
                  {new Date(suggested.computedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BotPowerBadge({ status }: { status: CockpitBotStatus }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider",
        status.power === "on"
          ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-400"
          : status.power === "off"
            ? "border-white/[0.12] bg-white/[0.04] text-muted-foreground/55"
            : "border-amber-500/25 bg-amber-500/10 text-amber-400/90",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status.power === "on"
            ? "bg-emerald-400 animate-pulse"
            : status.power === "off"
              ? "bg-muted-foreground/40"
              : "bg-amber-400",
        )}
      />
      {status.label}
      {status.detail && (
        <span className="font-medium normal-case text-muted-foreground/50">
          · {status.detail}
        </span>
      )}
    </div>
  );
}

function BotStatChip({
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
        "rounded-lg border px-2 py-1.5",
        accent
          ? "border-accent/20 bg-accent/[0.06]"
          : "border-white/[0.08] bg-[#1a1a1f]",
      )}
    >
      <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/45">
        {label}
      </div>
      <div
        className={cn(
          "text-[11px] font-black font-mono tabular-nums leading-tight",
          accent ? "text-accent" : "text-foreground/85",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[8px] text-muted-foreground/40">{sub}</div>}
    </div>
  );
}

function ZoneSide({
  side,
  strike,
  low,
  high,
  tp,
  tpConf,
  actionable,
}: {
  side: "bull" | "bear";
  strike: number | null;
  low: number | null;
  high: number | null;
  tp: number | null;
  tpConf: string | null;
  actionable: boolean | null | undefined;
}) {
  const isBull = side === "bull";
  const idle = strike != null && actionable === false;

  return (
    <div
      className={cn(
        SIM_INSET_TILE,
        "px-2.5 py-2 space-y-1",
        isBull
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-rose-500/30 bg-rose-500/[0.08]",
        idle && "opacity-55",
      )}
    >
      <div className="flex items-center gap-1">
        {isBull ? (
          <TrendingUp className="w-3 h-3 text-emerald-400/70" />
        ) : (
          <TrendingDown className="w-3 h-3 text-rose-400/70" />
        )}
        <span
          className={cn(
            "text-[9px] font-black uppercase tracking-wider",
            isBull ? "text-emerald-400/80" : "text-rose-400/80",
          )}
        >
          {isBull ? "Bull" : "Bear"}
        </span>
        {idle && (
          <span className="text-[7px] font-bold uppercase text-muted-foreground/50 ml-auto">
            idle
          </span>
        )}
      </div>
      {strike != null && low != null && high != null ? (
        <>
          <p
            className={cn(
              "text-[10px] font-mono font-bold leading-tight",
              isBull ? "text-emerald-300/90" : "text-rose-300/90",
            )}
          >
            ${low.toLocaleString()}–${high.toLocaleString()}
          </p>
          {tp != null && (
            <p className="text-[8px] font-mono text-muted-foreground/45">
              TP ${tp.toLocaleString()}
              {tpConf ? ` · ${tpConf}` : ""}
            </p>
          )}
        </>
      ) : (
        <p className="text-[9px] text-muted-foreground/40 leading-snug">
          No cluster
        </p>
      )}
    </div>
  );
}
