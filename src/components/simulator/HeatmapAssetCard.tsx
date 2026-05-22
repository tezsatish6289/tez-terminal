"use client";

import { useMemo } from "react";
import { TrendingDown, TrendingUp, Clock } from "lucide-react";
import { useIsoTimeLabel } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  deriveCockpitCardStatus,
  type CockpitCardStatus,
  type CockpitStatusBucket,
} from "@/lib/cockpit-card-status";
import {
  formatSpot,
  noClusterLine,
  spotFromSuggested,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";
import { SIM_CARD, SIM_INSET_TILE } from "@/components/simulator/simulator-surfaces";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";

const ASSET_TAG: Record<CockpitBotId, string> = {
  crypto: "BTC",
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
};

/** Fixed-height symmetrical heatmap card — same slots on all four bots. */
export function HeatmapAssetCard({
  botId,
  label,
  suggested,
  manualOverride,
  engineReason,
  engineDirection,
  simEnabled,
  botEngineLive,
  botLastRanAt,
  zonesRefreshedAt,
  capital,
  liveCount,
  closedCount,
  cs,
  settingsSlot,
  selected,
  onSelect,
}: {
  botId: CockpitBotId;
  label: string;
  suggested: SuggestedZonesSnapshot | null;
  manualOverride?: string | null;
  engineReason?: string | null;
  engineDirection?: ZoneBotDirection | null;
  simEnabled?: boolean | null;
  botEngineLive?: boolean;
  /** sync-simulator / sync-zone-bots last tick */
  botLastRanAt?: string | null;
  /** suggest-zones cron (Deribit OI snapshot) */
  zonesRefreshedAt?: string | null;
  capital: number;
  /** OPEN simulator_trades for this bot right now */
  liveCount: number;
  closedCount: number;
  cs: string;
  settingsSlot?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const spot = spotFromSuggested(suggested);
  const ivPct = suggested?.atmIV != null ? suggested.atmIV * 100 : null;
  const maxPainDays = suggested?.maxPainByExpiry ?? [];

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

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-heatmap-toolbar]")) return;
        onSelect?.();
      }}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        SIM_CARD,
        "flex flex-col h-full min-h-[448px] overflow-hidden",
        onSelect && "cursor-pointer transition-shadow",
        selected &&
          "ring-2 ring-accent/80 shadow-[0_0_0_1px_rgba(0,212,170,0.25),0_8px_28px_rgba(0,212,170,0.12)]",
        onSelect && !selected && "hover:ring-1 hover:ring-white/20",
      )}
    >
      {/* ── Header: title row + controls ── */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-white/[0.1] bg-[#1c1c21]">
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-[13px] font-black tracking-tight truncate">
              {label}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/45 px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.03]">
              {ASSET_TAG[botId]}
            </span>
            {ivPct != null && <IvBadge pct={ivPct} />}
          </div>
          {settingsSlot && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {settingsSlot}
            </div>
          )}
        </div>

        <p className="text-[12px] font-mono font-bold text-foreground/85 mt-2 tabular-nums leading-none">
          ${formatSpot(spot)}
        </p>
      </div>

      {/* ── Unified status (one hierarchy) ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] bg-[#141418] min-h-[52px] flex items-center">
        <CardStatusBar status={cardStatus} />
      </div>

      {/* ── Last ran — fixed height, always visible ── */}
      <LastRanBar
        botId={botId}
        botLastRanAt={botLastRanAt}
        zonesRefreshedAt={zonesRefreshedAt}
      />

      {/* ── Capital / live / closed — fixed height ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] bg-[#121214] h-[52px] grid grid-cols-3 gap-1.5">
        <BotStatChip
          label="Capital"
          value={`${cs}${capital.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          accent
        />
        <BotStatChip
          label="Live now"
          value={String(liveCount)}
          sub={liveCount === 1 ? "trade open" : "trades open"}
          live={liveCount > 0}
        />
        <BotStatChip
          label="Closed"
          value={String(closedCount)}
          sub="all time"
        />
      </div>

      {/* ── Body: fixed slots (alert · max pain · zones · footer) ── */}
      <div className="flex-1 flex flex-col px-3 py-2.5 gap-2 min-h-0">
        {!suggested ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] text-muted-foreground/40 text-center">
              Tap Refresh all to load zones
            </p>
          </div>
        ) : (
          <>
            <MaxPainDays entries={maxPainDays} />
            <div className="grid grid-cols-2 gap-2 min-h-[100px]">
              <ZoneClusterTile side="bull" suggested={suggested} />
              <ZoneClusterTile side="bear" suggested={suggested} />
            </div>
            {suggested.halfWidthUsd != null && (
              <p className="shrink-0 text-[9px] text-center text-muted-foreground/35 font-mono h-4 leading-4">
                ±${Math.round(suggested.halfWidthUsd)} half-width
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LastRanBar({
  botId,
  botLastRanAt,
  zonesRefreshedAt,
}: {
  botId: CockpitBotId;
  botLastRanAt?: string | null;
  zonesRefreshedAt?: string | null;
}) {
  const botTick = useIsoTimeLabel(botLastRanAt);
  const zones = useIsoTimeLabel(zonesRefreshedAt);
  const primary = botTick ?? zones;
  const label = botTick ? "Last ran" : "Zones";
  const showZonesSub =
    zones != null &&
    botTick != null &&
    zonesRefreshedAt !== botLastRanAt &&
    zones.relative !== botTick.relative;

  return (
    <div
      className="shrink-0 px-3 py-2 border-b border-white/[0.08] bg-[#16161a] min-h-[44px] flex flex-col justify-center"
      title={
        primary
          ? `${label} ${primary.relative} (${primary.clock})`
          : "No bot tick or zone data yet"
      }
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
        <Clock className="w-3.5 h-3.5 text-accent/60 shrink-0" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">
          {label}
        </span>
        {primary ? (
          <>
            <span className="text-[12px] font-black text-accent tabular-nums">
              {primary.relative}
            </span>
            <span className="text-[10px] font-mono text-foreground/50 tabular-nums">
              {primary.clock}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </div>
      {showZonesSub && zones && (
        <p className="text-[9px] text-muted-foreground/45 mt-0.5 pl-5 truncate">
          Zones refreshed {zones.relative} · {zones.clock}
        </p>
      )}
    </div>
  );
}

function IvBadge({ pct }: { pct: number }) {
  return (
    <span
      className={cn(
        "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0",
        pct >= 70
          ? "border-rose-500/30 text-rose-300 bg-rose-500/10"
          : pct >= 50
            ? "border-amber-500/30 text-amber-200 bg-amber-500/10"
            : "border-emerald-500/25 text-emerald-300/90 bg-emerald-500/5",
      )}
    >
      IV {pct.toFixed(0)}%
    </span>
  );
}

const BUCKET_STYLES: Record<
  CockpitStatusBucket,
  { bar: string; dot: string; bucket: string; headline: string }
> = {
  blocked: {
    bar: "border-white/[0.12] bg-white/[0.04]",
    dot: "bg-muted-foreground/45",
    bucket: "text-muted-foreground/55",
    headline: "text-foreground/75",
  },
  waiting: {
    bar: "border-amber-500/25 bg-amber-500/10",
    dot: "bg-amber-400",
    bucket: "text-amber-400/80",
    headline: "text-amber-200/90",
  },
  ready: {
    bar: "border-emerald-500/35 bg-emerald-500/15",
    dot: "bg-emerald-400 animate-pulse",
    bucket: "text-emerald-400/80",
    headline: "text-emerald-300",
  },
};

function CardStatusBar({ status }: { status: CockpitCardStatus }) {
  const s = BUCKET_STYLES[status.bucket];
  const title = [status.bucketLabel, status.headline, status.detail]
    .filter(Boolean)
    .join(" — ");

  return (
    <div
      className={cn(
        "w-full flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border min-h-[44px] justify-center",
        s.bar,
      )}
      title={title}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("h-2 w-2 rounded-full shrink-0", s.dot)} />
        <span
          className={cn(
            "text-[8px] font-black uppercase tracking-widest shrink-0",
            s.bucket,
          )}
        >
          {status.bucketLabel}
        </span>
        <span
          className={cn(
            "text-[10px] font-bold truncate min-w-0",
            s.headline,
          )}
        >
          {status.headline}
        </span>
      </div>
      {status.detail && (
        <p className="text-[9px] text-muted-foreground/50 pl-4 truncate leading-snug">
          {status.detail}
        </p>
      )}
    </div>
  );
}

function MaxPainDays({
  entries,
}: {
  entries: NonNullable<SuggestedZonesSnapshot["maxPainByExpiry"]>;
}) {
  if (entries.length === 0) {
    return (
      <div className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 h-8 flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground/25">Max pain —</span>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-lg border border-accent/20 bg-accent/[0.05] overflow-hidden">
      <div className="px-2 py-1 border-b border-accent/10">
        <span className="text-[8px] font-bold uppercase tracking-widest text-accent/55">
          Max pain (3 days)
        </span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {entries.map((entry) => {
          const label =
            entry.dayIndex === 0
              ? "Today"
              : entry.dayIndex === 1
                ? "D+1"
                : "D+2";
          const isDay0 = entry.dayIndex === 0;
          return (
            <div
              key={entry.expiry}
              className="flex items-center justify-between px-2 py-1 gap-1"
            >
              <span
                className={cn(
                  "text-[8px] font-bold uppercase tracking-wider shrink-0",
                  isDay0 ? "text-accent/70" : "text-muted-foreground/45",
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  "text-[10px] font-mono font-bold tabular-nums",
                  isDay0 ? "text-accent" : "text-foreground/55",
                )}
              >
                ${entry.maxPain.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BotStatChip({
  label,
  value,
  sub,
  accent,
  live,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-1.5 py-1.5 h-full flex flex-col justify-center min-w-0",
        live
          ? "border-emerald-500/35 bg-emerald-500/10"
          : accent
            ? "border-accent/20 bg-accent/[0.06]"
            : "border-white/[0.08] bg-[#1a1a1f]",
      )}
    >
      <div className="flex items-center gap-1">
        {live && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        )}
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/45 leading-none truncate">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "text-[11px] font-black font-mono tabular-nums leading-tight mt-0.5",
          live
            ? "text-emerald-400"
            : accent
              ? "text-accent"
              : "text-foreground/85",
        )}
      >
        {value}
      </div>
      <div className="text-[8px] text-muted-foreground/40 leading-none mt-0.5 h-3">
        {sub ?? "\u00A0"}
      </div>
    </div>
  );
}

function ZoneClusterTile({
  side,
  suggested,
}: {
  side: "bull" | "bear";
  suggested: SuggestedZonesSnapshot;
}) {
  const isBull = side === "bull";
  const strike = isBull ? suggested.bullStrike : suggested.bearStrike;
  const low = isBull ? suggested.bullZoneLow : suggested.bearZoneLow;
  const high = isBull ? suggested.bullZoneHigh : suggested.bearZoneHigh;
  const tp = isBull ? suggested.bullTpTarget : suggested.bearTpTarget;
  const tpConf = isBull ? suggested.bullTpConfidence : suggested.bearTpConfidence;
  const actionable = isBull ? suggested.bullActionable : suggested.bearActionable;
  const oi = isBull ? suggested.bullOI : suggested.bearOI;
  const share = isBull ? suggested.bullClusterShare : suggested.bearClusterShare;
  const locked = isBull ? suggested.bullLocked : suggested.bearLocked;

  const hasZone = low != null && high != null;
  const idle = hasZone && actionable === false;

  return (
    <div
      className={cn(
        SIM_INSET_TILE,
        "px-2 py-2 h-full min-h-[100px] flex flex-col gap-1",
        isBull
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-rose-500/30 bg-rose-500/[0.08]",
        idle && "opacity-70",
      )}
    >
      <div className="flex items-center gap-1 shrink-0">
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
        {locked && (
          <span className="text-[7px] font-bold uppercase text-amber-300/80 ml-auto shrink-0">
            locked
          </span>
        )}
        {!locked && share != null && share > 0 && (
          <span
            className={cn(
              "text-[7px] font-bold px-1 py-0.5 rounded ml-auto shrink-0",
              isBull
                ? "bg-emerald-500/20 text-emerald-300/90"
                : "bg-rose-500/20 text-rose-300/90",
            )}
          >
            {Math.round(share * 100)}% OI
          </span>
        )}
        {!locked && idle && share == null && (
          <span className="text-[7px] font-bold uppercase text-muted-foreground/50 ml-auto">
            idle
          </span>
        )}
      </div>

      {hasZone ? (
        <div className="flex-1 flex flex-col justify-center gap-0.5 min-h-0">
          <p
            className={cn(
              "text-[10px] font-mono font-bold leading-tight",
              isBull ? "text-emerald-300/90" : "text-rose-300/90",
            )}
            title={`$${low.toLocaleString()}–$${high.toLocaleString()}`}
          >
            ${low.toLocaleString()}–${high.toLocaleString()}
          </p>
          {strike != null && (
            <p className="text-[8px] font-mono text-muted-foreground/45 truncate">
              @{strike.toLocaleString()}
            </p>
          )}
          {oi != null && oi > 0 && (
            <p className="text-[8px] text-muted-foreground/40 truncate">
              {Math.round(oi).toLocaleString()} contracts OI
            </p>
          )}
          {tp != null && (
            <p className="text-[8px] font-mono text-muted-foreground/50 truncate">
              TP ${tp.toLocaleString()}
              {tpConf ? ` · ${tpConf}` : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[9px] text-muted-foreground/45 leading-snug flex-1 flex items-center">
          {noClusterLine(side, suggested)}
        </p>
      )}
    </div>
  );
}
