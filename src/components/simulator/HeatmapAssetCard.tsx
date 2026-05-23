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

      {/* ── Body: vertical price ladder — bear band on top, bull on
           bottom, max-pain lines between, current price as the yellow
           anchor. The actual price-vs-level distance is drawn to scale
           so traders can perceive "how far above bull / below bear" by
           eye instead of reading numbers and subtracting in their head. */}
      <div className="flex-1 flex flex-col min-h-0">
        {!suggested ? (
          <div className="flex-1 flex items-center justify-center px-3 py-6">
            <p className="text-[10px] text-muted-foreground/40 text-center">
              Tap Refresh all to load zones
            </p>
          </div>
        ) : (
          <ZonePriceLadder suggested={suggested} spot={spot} />
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
 * Vertical price ladder — replaces the row-by-row table with a spatial
 * visualization where each level (bull/bear bands, max-pain lines,
 * current price) sits at its actual price on a shared y-axis. Price is
 * inherently vertical for traders, so this lets the eye perceive
 * "how far above bull am I" instinctively instead of reading numbers
 * and subtracting them in your head.
 *
 * No candles — just the levels — but the spatial relationship is what
 * matters: bull band at the bottom (green), bear band at the top (red),
 * max-pain magnet lines in between (white), spot as the yellow anchor.
 * Left-side label tags carry the metadata (strike, OI, half-width, TP);
 * right-side tags show the raw price number per level.
 */
function ZonePriceLadder({
  suggested,
  spot,
}: {
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
}) {
  const bullLow = suggested.bullZoneLow;
  const bullHigh = suggested.bullZoneHigh;
  const bullStrike = suggested.bullStrike;
  const bullOI = suggested.bullOI;
  const bullShare = suggested.bullClusterShare;
  const bullTp = suggested.bullTpTarget;
  const bullActionable = suggested.bullActionable;
  const bullLocked = suggested.bullLocked;

  const bearLow = suggested.bearZoneLow;
  const bearHigh = suggested.bearZoneHigh;
  const bearStrike = suggested.bearStrike;
  const bearOI = suggested.bearOI;
  const bearShare = suggested.bearClusterShare;
  const bearTp = suggested.bearTpTarget;
  const bearActionable = suggested.bearActionable;
  const bearLocked = suggested.bearLocked;

  const halfWidth = suggested.halfWidthUsd;

  const days = suggested.maxPainByExpiry ?? [];

  // Group max-pain entries that share the same magnet price — common
  // case is Today+Tomorrow both pinning to the same expiry's pain. Keeps
  // labels from stacking on top of each other on the ladder.
  const mpGroups = useMemo(() => {
    const buckets = new Map<number, { price: number; labels: string[] }>();
    for (const e of days) {
      const key = Math.round(e.maxPain * 100) / 100;
      const dayLabel =
        e.dayIndex === 0 ? "Today" : e.dayIndex === 1 ? "D+1" : "D+2";
      const existing = buckets.get(key);
      if (existing) {
        existing.labels.push(dayLabel);
      } else {
        buckets.set(key, { price: e.maxPain, labels: [dayLabel] });
      }
    }
    return Array.from(buckets.values()).sort((a, b) => b.price - a.price);
  }, [days]);

  // Compute the visualization range — every level we'll plot, plus padding.
  const prices: number[] = [];
  if (spot != null) prices.push(spot);
  if (bullLow != null) prices.push(bullLow);
  if (bullHigh != null) prices.push(bullHigh);
  if (bearLow != null) prices.push(bearLow);
  if (bearHigh != null) prices.push(bearHigh);
  for (const g of mpGroups) prices.push(g.price);

  if (prices.length < 2) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[10px] text-muted-foreground/40">
          Not enough zone data to render ladder
        </p>
      </div>
    );
  }

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, 1);
  const padPx = span * 0.12;
  const renderMin = minP - padPx;
  const renderMax = maxP + padPx;
  const renderSpan = renderMax - renderMin;

  const HEIGHT_PX = 280;
  const yFor = (price: number): number =>
    HEIGHT_PX * (1 - (price - renderMin) / renderSpan);

  const fmt = (p: number): string =>
    p >= 1000
      ? Math.round(p).toLocaleString()
      : p.toLocaleString(undefined, {
          minimumFractionDigits: p < 10 ? 3 : 2,
          maximumFractionDigits: p < 10 ? 3 : 2,
        });

  const bullBandStyle: React.CSSProperties | null =
    bullLow != null && bullHigh != null
      ? { top: yFor(bullHigh), height: yFor(bullLow) - yFor(bullHigh) }
      : null;
  const bearBandStyle: React.CSSProperties | null =
    bearLow != null && bearHigh != null
      ? { top: yFor(bearHigh), height: yFor(bearLow) - yFor(bearHigh) }
      : null;

  // Detail strings — match the user's chart annotation style.
  const bullDetail = (() => {
    const bits: string[] = [];
    if (bullStrike != null) bits.push(`@ ${fmt(bullStrike)}`);
    if (halfWidth != null) bits.push(`HW ${Math.round(halfWidth)}`);
    if (bullOI != null && bullOI > 0)
      bits.push(`OI ${Math.round(bullOI).toLocaleString()}`);
    if (bullShare != null && bullShare > 0)
      bits.push(`${Math.round(bullShare * 100)}%`);
    if (bullTp != null) bits.push(`TP ${fmt(bullTp)}`);
    if (bullLocked) bits.push("LOCKED");
    return bits.join(" · ");
  })();
  const bearDetail = (() => {
    const bits: string[] = [];
    if (bearStrike != null) bits.push(`@ ${fmt(bearStrike)}`);
    if (halfWidth != null) bits.push(`HW ${Math.round(halfWidth)}`);
    if (bearOI != null && bearOI > 0)
      bits.push(`OI ${Math.round(bearOI).toLocaleString()}`);
    if (bearShare != null && bearShare > 0)
      bits.push(`${Math.round(bearShare * 100)}%`);
    if (bearTp != null) bits.push(`TP ${fmt(bearTp)}`);
    if (bearLocked) bits.push("LOCKED");
    return bits.join(" · ");
  })();

  const bullIdle = bullBandStyle != null && bullActionable === false;
  const bearIdle = bearBandStyle != null && bearActionable === false;

  return (
    <div className="px-3 py-3">
      <div
        className="relative w-full rounded-lg border border-white/[0.06] bg-[#0a0a0c] overflow-hidden"
        style={{ height: HEIGHT_PX }}
      >
        {/* ── Bear band ── */}
        {bearBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0 border-y border-rose-500/40 bg-rose-500/[0.14]",
              bearIdle && "opacity-60",
            )}
            style={bearBandStyle}
          >
            <span className="absolute top-0.5 left-2 text-[9px] font-mono font-bold text-rose-300/95 whitespace-nowrap">
              Bear zone {bearDetail}
            </span>
            <span className="absolute top-0.5 right-2 text-[9px] font-mono font-bold text-rose-300/90 tabular-nums">
              ${bearHigh != null ? fmt(bearHigh) : "—"}
            </span>
            <span className="absolute bottom-0.5 right-2 text-[9px] font-mono text-rose-300/55 tabular-nums">
              ${bearLow != null ? fmt(bearLow) : "—"}
            </span>
          </div>
        )}

        {/* ── Max-pain lines (between bands) ── */}
        {mpGroups.map((g) => {
          const isToday = g.labels.includes("Today");
          return (
            <div
              key={`mp-${g.price}`}
              className={cn(
                "absolute left-0 right-0 border-t border-dashed",
                isToday ? "border-accent/70" : "border-white/35",
              )}
              style={{ top: yFor(g.price) }}
            >
              <span
                className={cn(
                  "absolute left-2 -top-3 text-[9px] font-mono font-bold whitespace-nowrap",
                  isToday ? "text-accent" : "text-foreground/75",
                )}
              >
                Max pain ({g.labels.join(" & ")})
              </span>
              <span
                className={cn(
                  "absolute right-2 -top-3 text-[9px] font-mono font-bold tabular-nums",
                  isToday ? "text-accent" : "text-foreground/75",
                )}
              >
                ${fmt(g.price)}
              </span>
            </div>
          );
        })}

        {/* ── Current price (the anchor) ── */}
        {spot != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-amber-300"
            style={{ top: yFor(spot) }}
          >
            <span className="absolute left-2 -top-3.5 text-[10px] font-mono font-black text-amber-300 whitespace-nowrap drop-shadow">
              Current price
            </span>
            <span className="absolute right-2 -top-3.5 text-[10px] font-mono font-black text-amber-300 tabular-nums">
              ${fmt(spot)}
            </span>
          </div>
        )}

        {/* ── Bull band ── */}
        {bullBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0 border-y border-emerald-500/40 bg-emerald-500/[0.14]",
              bullIdle && "opacity-60",
            )}
            style={bullBandStyle}
          >
            <span className="absolute top-0.5 right-2 text-[9px] font-mono font-bold text-emerald-300/90 tabular-nums">
              ${bullHigh != null ? fmt(bullHigh) : "—"}
            </span>
            <span className="absolute bottom-0.5 left-2 text-[9px] font-mono font-bold text-emerald-300/95 whitespace-nowrap">
              Bull zone {bullDetail}
            </span>
            <span className="absolute bottom-0.5 right-2 text-[9px] font-mono text-emerald-300/55 tabular-nums">
              ${bullLow != null ? fmt(bullLow) : "—"}
            </span>
          </div>
        )}

        {/* ── Range bookend tags (top / bottom of the visible window) ── */}
        <span className="absolute top-1 right-2 text-[8px] font-mono text-muted-foreground/30 tabular-nums pointer-events-none">
          {!bearBandStyle && `${fmt(renderMax)}`}
        </span>
        <span className="absolute bottom-1 right-2 text-[8px] font-mono text-muted-foreground/30 tabular-nums pointer-events-none">
          {!bullBandStyle && `${fmt(renderMin)}`}
        </span>
      </div>

      {/* ── Missing-side fallback text (e.g. "No bull setup") ── */}
      {(!bullBandStyle || !bearBandStyle) && (
        <p className="text-[9px] text-muted-foreground/45 italic mt-2 text-center">
          {!bullBandStyle && noClusterLine("bull", suggested)}
          {!bullBandStyle && !bearBandStyle ? " · " : ""}
          {!bearBandStyle && noClusterLine("bear", suggested)}
        </p>
      )}
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

