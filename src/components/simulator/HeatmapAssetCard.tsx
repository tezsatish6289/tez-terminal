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
import { SIM_CARD } from "@/components/simulator/simulator-surfaces";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";

const ASSET_TAG: Record<CockpitBotId, string> = {
  crypto: "BTC",
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
  xrp: "XRP",
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
  footerSlot,
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
  /** Slot rendered inside the same card, below the BULL/BEAR section. Used
   *  by `BotCockpit` to fold the Open / History / Logs tabs into one
   *  continuous panel with the heatmap status above it. When present,
   *  the card drops its fixed height so the footer can size naturally. */
  footerSlot?: React.ReactNode;
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
        "flex flex-col overflow-hidden",
        // When the card is used standalone (no footer), keep its old
        // fixed-height shape so cards in a row stay aligned. Once a
        // footer slot is wired in (the master-detail cockpit) the card
        // sizes to content so the tabs can flow naturally below.
        !footerSlot && "h-full min-h-[448px]",
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

      {/* ── Body: single-column scannable stat rows ──
           price · today MP · D+1 MP · D+2 MP · bull · bear */}
      <div className="flex-1 flex flex-col min-h-0">
        {!suggested ? (
          <div className="flex-1 flex items-center justify-center px-3 py-6">
            <p className="text-[10px] text-muted-foreground/40 text-center">
              Tap Refresh all to load zones
            </p>
          </div>
        ) : (
          <>
            <ZoneStatRows suggested={suggested} spot={spot} />
            {suggested.halfWidthUsd != null && (
              <p className="shrink-0 text-[9px] text-center text-muted-foreground/35 font-mono px-3 py-2">
                ±${Math.round(suggested.halfWidthUsd)} half-width
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Footer slot — Open / History / Logs tabs in the cockpit ── */}
      {footerSlot && (
        <div className="shrink-0 border-t border-white/[0.1] bg-[#101013]">
          {footerSlot}
        </div>
      )}
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

/**
 * Single-column scannable stat table — replaces the older 3-row max-pain
 * tile + 2-col bull/bear grid. Each row is one horizontal line with a
 * label on the left and the value (+ optional Δ-vs-spot or OI detail)
 * on the right, so the eye runs top-to-bottom without jumping columns.
 *
 * Rows:  Price → Today MP → D+1 MP → D+2 MP → Bull zone → Bear zone
 */
function ZoneStatRows({
  suggested,
  spot,
}: {
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
}) {
  const maxPainDays = suggested.maxPainByExpiry ?? [];
  const day0 = maxPainDays.find((e) => e.dayIndex === 0);
  const day1 = maxPainDays.find((e) => e.dayIndex === 1);
  const day2 = maxPainDays.find((e) => e.dayIndex === 2);

  return (
    <div className="divide-y divide-white/[0.05]">
      {/* anchor row — spot price for the bot's perp */}
      <StatRow
        label="Price"
        value={spot != null ? `$${formatSpot(spot)}` : "—"}
        emphasis
      />

      <MaxPainRow label="Today max pain" entry={day0 ?? null} spot={spot} accent />
      <MaxPainRow label="D+1 max pain" entry={day1 ?? null} spot={spot} />
      <MaxPainRow label="D+2 max pain" entry={day2 ?? null} spot={spot} />

      <ZoneRow side="bull" suggested={suggested} />
      <ZoneRow side="bear" suggested={suggested} />
    </div>
  );
}

function StatRow({
  label,
  value,
  detail,
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Right-aligned secondary text (Δ vs spot, OI %, etc.) */
  detail?: React.ReactNode;
  /** Bigger / brighter primary value for the anchor (Price) row */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 flex items-center justify-between gap-3 min-w-0",
        className,
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/55 shrink-0 min-w-[6.5rem]">
        {label}
      </span>
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span
          className={cn(
            "font-mono font-bold tabular-nums truncate text-right",
            emphasis
              ? "text-[13px] text-foreground"
              : "text-[11px] text-foreground/85",
          )}
        >
          {value}
        </span>
        {detail && (
          <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

function MaxPainRow({
  label,
  entry,
  spot,
  accent,
}: {
  label: string;
  entry: NonNullable<SuggestedZonesSnapshot["maxPainByExpiry"]>[number] | null;
  spot: number | null;
  /** Today's row gets the accent tint (the magnet that matters most) */
  accent?: boolean;
}) {
  if (!entry) {
    return (
      <StatRow
        label={label}
        value={<span className="text-muted-foreground/35">—</span>}
      />
    );
  }
  const mp = entry.maxPain;
  let detail: React.ReactNode = null;
  if (spot != null && spot > 0) {
    const deltaPct = ((mp - spot) / spot) * 100;
    const above = deltaPct >= 0;
    detail = (
      <span
        className={cn(above ? "text-emerald-300/70" : "text-rose-300/70")}
      >
        {above ? "+" : ""}
        {deltaPct.toFixed(1)}% {above ? "above" : "below"}
      </span>
    );
  }
  return (
    <StatRow
      label={
        <span className={cn(accent && "text-accent/70")}>{label}</span>
      }
      value={
        <span className={cn(accent && "text-accent")}>
          ${mp.toLocaleString()}
        </span>
      }
      detail={detail}
      className={cn(accent && "bg-accent/[0.04]")}
    />
  );
}

function ZoneRow({
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

  const labelText = isBull ? "Bull zone" : "Bear zone";
  const labelEl = (
    <span
      className={cn(
        "flex items-center gap-1",
        isBull ? "text-emerald-400/80" : "text-rose-400/80",
      )}
    >
      {isBull ? (
        <TrendingUp className="w-3 h-3 shrink-0" />
      ) : (
        <TrendingDown className="w-3 h-3 shrink-0" />
      )}
      <span>{labelText}</span>
    </span>
  );

  if (!hasZone) {
    return (
      <StatRow
        label={labelEl}
        value={
          <span className="text-[10px] font-normal text-muted-foreground/45 italic">
            {noClusterLine(side, suggested)}
          </span>
        }
        className={cn(
          isBull ? "bg-emerald-500/[0.04]" : "bg-rose-500/[0.04]",
        )}
      />
    );
  }

  const detailBits: string[] = [];
  if (strike != null) detailBits.push(`@${strike.toLocaleString()}`);
  if (oi != null && oi > 0) {
    detailBits.push(`${Math.round(oi).toLocaleString()} OI`);
  }
  if (share != null && share > 0) {
    detailBits.push(`${Math.round(share * 100)}%`);
  }
  if (tp != null) {
    detailBits.push(`TP $${tp.toLocaleString()}${tpConf ? ` · ${tpConf}` : ""}`);
  }
  if (locked) detailBits.push("LOCKED");

  return (
    <StatRow
      label={labelEl}
      value={
        <span
          className={cn(
            idle && "opacity-60",
            isBull ? "text-emerald-300/95" : "text-rose-300/95",
          )}
          title={`$${low.toLocaleString()}–$${high.toLocaleString()}`}
        >
          ${low.toLocaleString()}–${high.toLocaleString()}
        </span>
      }
      detail={
        detailBits.length > 0 ? (
          <span
            className={cn(
              "text-[9px] font-mono tabular-nums",
              isBull ? "text-emerald-300/55" : "text-rose-300/55",
            )}
          >
            {detailBits.join(" · ")}
          </span>
        ) : null
      }
      className={cn(
        isBull ? "bg-emerald-500/[0.04]" : "bg-rose-500/[0.04]",
      )}
    />
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

