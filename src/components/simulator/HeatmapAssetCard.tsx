"use client";

import { useMemo } from "react";
import { TrendingDown, TrendingUp, Clock, Globe, EyeOff } from "lucide-react";
import { useIsoTimeLabel } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  deriveCockpitCardStatus,
  type CockpitCardStatus,
} from "@/lib/cockpit-card-status";
import {
  formatIvExplainer,
  formatSpot,
  noClusterLine,
  spotFromSuggested,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";
import { SIM_CARD, COCKPIT_RAIL_GLASS } from "@/components/simulator/simulator-surfaces";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";
import {
  AutoScrollZonesPanel,
  type ZoneCarouselItem,
} from "@/components/simulator/AutoScrollZonesPanel";

const POWER_DOT: Record<CockpitCardStatus["power"], string> = {
  on: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]",
  idle: "bg-amber-300/90 shadow-[0_0_8px_rgba(252,211,77,0.45)]",
  off: "bg-rose-400/90 shadow-[0_0_8px_rgba(251,113,133,0.45)]",
};

const POWER_TEXT: Record<CockpitCardStatus["power"], string> = {
  on: "text-emerald-300",
  idle: "text-amber-200",
  off: "text-rose-300",
};

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
  liveSpot,
  manualOverride,
  publicLive,
  liveMirroringEnabled,
  engineReason,
  engineDirection,
  simEnabled,
  botEngineLive,
  botLastRanAt,
  zonesRefreshedAt,
  capital,
  startingCapital,
  liveCount,
  cs,
  settingsSlot,
  footerSlot,
  zoneCarouselItems,
  selected,
  onSelect,
}: {
  botId: CockpitBotId;
  label: string;
  suggested: SuggestedZonesSnapshot | null;
  /** Fresh per-bot spot from `config/exchange_prices` (1-min cron).
   *  Falls back to `spotFromSuggested(suggested)` if the live feed is
   *  missing. Drives both the ladder's "Current price" line and the
   *  IV explainer math. */
  liveSpot?: number | null;
  /** Status inputs — used by the dot+reason row in the header. The
   *  left rail now shows only the dot (replaces the AUTO/OFF badge),
   *  so the right pane owns the headline + detail commentary. */
  manualOverride?: string | null;
  /** Public-discovery state — drives the small badge next to IV. When
   *  true, this bot is listed on freedombot.ai. When false, hidden from
   *  the catalog (existing subscribers are unaffected; the per-user
   *  opt-in stays on). Toggle lives in the Config sheet behind the
   *  passphrase. */
  publicLive?: boolean;
  /** Whether NEW sim entries fan out to live mirrors. Drives the small
   *  "Live mirror" status pip next to the IV badge — purely informational
   *  on the card; the actual toggle is the 3-state pill in the toolbar.
   *  `undefined` is treated as enabled (legacy compat). */
  liveMirroringEnabled?: boolean;
  engineReason?: string | null;
  engineDirection?: ZoneBotDirection | null;
  simEnabled?: boolean | null;
  botEngineLive?: boolean;
  /** sync-simulator / sync-zone-bots last tick */
  botLastRanAt?: string | null;
  /** suggest-zones cron (Deribit OI snapshot) */
  zonesRefreshedAt?: string | null;
  capital: number;
  /** Seed capital — used for the Δ% pill in the header */
  startingCapital: number;
  /** Open simulator trades — feeds the "Managing trade" status */
  liveCount?: number;
  cs: string;
  settingsSlot?: React.ReactNode;
  /** Slot rendered inside the same card, below the BULL/BEAR section. Used
   *  by `BotCockpit` to fold the Open / History / Logs tabs into one
   *  continuous panel with the heatmap status above it. When present,
   *  the card drops its fixed height so the footer can size naturally. */
  footerSlot?: React.ReactNode;
  /** Other bots' zone snapshots — rendered as an auto-scrolling carousel
   *  beside the selected bot's full detail ladder. */
  zoneCarouselItems?: ZoneCarouselItem[];
  selected?: boolean;
  onSelect?: () => void;
}) {
  // Prefer the 1-min live spot from `config/exchange_prices`; fall
  // back to the 15-min `suggested_zones_*` snapshot if the live feed
  // is missing (e.g. sync-prices cron blip).
  const spot = liveSpot ?? spotFromSuggested(suggested);
  const ivPct = suggested?.atmIV != null ? suggested.atmIV * 100 : null;

  const delta = capital - startingCapital;
  const deltaPct =
    startingCapital > 0 ? (delta / startingCapital) * 100 : 0;

  // Same status derivation as the left-rail row — keeps the dot color
  // identical on both sides of the master-detail layout. The headline
  // + detail get rendered here instead of the rail.
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
        !footerSlot && "min-h-[400px] lg:min-h-[448px]",
        onSelect && "cursor-pointer transition-shadow",
        selected &&
          "ring-2 ring-accent/80 shadow-[0_0_0_1px_rgba(0,212,170,0.25),0_8px_28px_rgba(0,212,170,0.12)]",
        onSelect && !selected && "hover:ring-1 hover:ring-white/20",
      )}
    >
      {/* ── Split body: metadata left · zone ladder right ── */}
      <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
        {/* Left — bot identity, controls, capital, status */}
        <div className="shrink-0 sm:w-[260px] md:w-[280px] lg:w-[300px] xl:w-[320px] flex flex-col gap-4 px-4 py-5 border-b sm:border-b-0 sm:border-r border-white/[0.1] bg-gradient-to-b from-[#1c1c24] to-[#141418]">
          {/* Header */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "shrink-0 inline-block w-2.5 h-2.5 rounded-full",
                  POWER_DOT[cardStatus.power],
                )}
                aria-hidden
              />
              <span className="text-base font-black tracking-tight text-white truncate">
                {label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <CockpitTag>{ASSET_TAG[botId]}</CockpitTag>
              {ivPct != null && (
                <IvBadge
                  pct={ivPct}
                  title={formatIvExplainer(ivPct, spot, ASSET_TAG[botId])}
                />
              )}
              <DiscoveryBadge publicLive={publicLive === true} />
              {liveMirroringEnabled === false && <SimOnlyBadge />}
            </div>
          </div>

          {/* Controls card */}
          {settingsSlot && (
            <div className={COCKPIT_RAIL_GLASS}>
              <div
                className="w-full"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {settingsSlot}
              </div>
            </div>
          )}

          {/* Performance + status card */}
          <div className={cn(COCKPIT_RAIL_GLASS, "mt-auto space-y-3")}>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl font-mono font-black tabular-nums text-white leading-none">
                {cs}
                {capital.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] font-mono font-bold tabular-nums leading-none shrink-0",
                  delta >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {delta >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {delta >= 0 ? "+" : ""}
                {deltaPct.toFixed(2)}%
                <span className="text-[10px]">{delta >= 0 ? "▲" : "▼"}</span>
              </span>
            </div>
            <LastRanInline
              botId={botId}
              botLastRanAt={botLastRanAt}
              zonesRefreshedAt={zonesRefreshedAt}
              stacked
            />
            <div className="flex flex-col gap-1 min-w-0 pt-3 border-t border-white/[0.08]">
              <span
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.12em]",
                  POWER_TEXT[cardStatus.power],
                )}
              >
                {cardStatus.headline}
              </span>
              {cardStatus.detail && (
                <span
                  className="text-[11px] text-muted-foreground/65 leading-snug"
                  title={cardStatus.detail}
                >
                  {cardStatus.detail}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right — selected bot ladder · auto-scroll carousel */}
        <div className="flex-1 flex flex-col xl:flex-row min-w-0 min-h-[360px]">
          <div className="flex-1 flex flex-col min-w-0 min-h-[360px]">
            {!suggested ? (
              <div className="flex-1 flex items-center justify-center px-4 py-8">
                <p className="text-[10px] text-muted-foreground/40 text-center">
                  Tap Refresh all to load zones
                </p>
              </div>
            ) : (
              <ZonePriceLadder
                suggested={suggested}
                spot={spot}
                engineDirection={engineDirection}
                compact
              />
            )}
          </div>

          {zoneCarouselItems && zoneCarouselItems.length > 0 && (
            <div className="flex-1 min-w-0 min-h-[280px] xl:min-h-0 border-t xl:border-t-0 xl:border-l border-white/[0.08] bg-[#0a0a0c]/40">
              <AutoScrollZonesPanel items={zoneCarouselItems} />
            </div>
          )}
        </div>
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

/**
 * Compact "updated 1m ago" tag for the card header — replaces the
 * heavier `LastRanBar` row that used to sit between the status banner
 * and the Capital/Live/Closed tile. Carries the bot's most recent tick
 * (or zones-refreshed timestamp as fallback) in one short line. Full
 * "Last ran X · Zones refreshed Y" stays available as a hover title.
 */
function LastRanInline({
  botId: _botId,
  botLastRanAt,
  zonesRefreshedAt,
  stacked = false,
}: {
  botId: CockpitBotId;
  botLastRanAt?: string | null;
  zonesRefreshedAt?: string | null;
  stacked?: boolean;
}) {
  const botTick = useIsoTimeLabel(botLastRanAt);
  const zones = useIsoTimeLabel(zonesRefreshedAt);
  const primary = botTick ?? zones;
  const label = botTick ? "Updated" : "Zones";
  const title = (() => {
    const parts: string[] = [];
    if (botTick) parts.push(`Last ran ${botTick.relative} (${botTick.clock})`);
    if (zones && (!botTick || zonesRefreshedAt !== botLastRanAt))
      parts.push(`Zones refreshed ${zones.relative} (${zones.clock})`);
    return parts.join(" · ");
  })();

  if (!primary) {
    return (
      <span
        className="text-[9px] text-muted-foreground/40 leading-none shrink-0"
        title="No bot tick or zone data yet"
      >
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-[10px] text-muted-foreground/55 leading-none tabular-nums",
        stacked ? "inline-flex items-center gap-1.5" : "inline-flex items-center gap-1 shrink-0",
      )}
      title={title}
    >
      <Clock className="w-3.5 h-3.5 text-accent/60 shrink-0" />
      <span className="font-semibold text-muted-foreground/50">{label}</span>
      <span className="text-accent/90 font-bold">{primary.relative}</span>
    </span>
  );
}

/** Accent-bordered tag pill for the cockpit rail header. */
function CockpitTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider text-accent/85 px-2 py-0.5 rounded-md border border-accent/30 bg-accent/[0.06]">
      {children}
    </span>
  );
}

/**
 * Public-discovery indicator. Two states:
 *   • publicLive === true  → emerald pill "Public" — bot is listed on
 *                            freedombot.ai catalog.
 *   • publicLive === false → muted pill "Hidden" — bot is admin-only.
 *
 * Existing subscribers continue receiving signals regardless of this
 * flag (per the agreed semantic: pure visibility, cleanly orthogonal
 * to the live-mirroring toggle). The flag is changed via the Config
 * sheet's passphrase-gated dialog; this badge is read-only.
 */
function DiscoveryBadge({ publicLive }: { publicLive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border shrink-0",
        publicLive
          ? "text-accent/85 border-accent/30 bg-accent/[0.06]"
          : "text-muted-foreground/55 border-white/[0.08] bg-white/[0.02]",
      )}
      title={
        publicLive
          ? "Public on freedombot.ai — listed in the catalog. Existing subscribers continue regardless."
          : "Hidden from freedombot.ai catalog. Existing subscribers are unaffected; admin-only visibility."
      }
    >
      {publicLive ? <Globe className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
      {publicLive ? "Public" : "Hidden"}
    </span>
  );
}

/**
 * Shown only when the bot is explicitly in SIM_ONLY mode (admin set
 * `liveMirroringEnabled: false`). Legacy bots with the field unset
 * default to mirroring on and do not render this badge.
 */
function SimOnlyBadge() {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 text-amber-300/90 border-amber-500/30 bg-amber-500/10"
      title="Sim only — new sim trades will NOT fan out to live mirrors. Existing open live trades continue their lifecycle (SL/TP/kill switch all cascade through)."
    >
      Sim only
    </span>
  );
}

function IvBadge({ pct, title }: { pct: number; title?: string }) {
  return (
    <span
      className={cn(
        "text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border shrink-0 cursor-help",
        pct >= 70
          ? "border-rose-500/35 text-rose-300/90 bg-rose-500/10"
          : pct >= 50
            ? "border-amber-500/35 text-amber-200/90 bg-amber-500/10"
            : "border-accent/30 text-accent/85 bg-accent/[0.06]",
      )}
      title={title}
    >
      IV {pct.toFixed(0)}%
    </span>
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
  engineDirection,
  compact = false,
}: {
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
  engineDirection?: ZoneBotDirection | null;
  compact?: boolean;
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

  const { bullSl, bearSl } = useMemo(
    () =>
      computeZoneSlAnchors({
        halfWidthUsd: halfWidth,
        bullZoneLow: bullLow,
        bullZoneHigh: bullHigh,
        bearZoneLow: bearLow,
        bearZoneHigh: bearHigh,
      }),
    [halfWidth, bullLow, bullHigh, bearLow, bearHigh],
  );

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
  if (bullSl != null) prices.push(bullSl);
  if (bearSl != null) prices.push(bearSl);

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

  const CHART_HEIGHT = compact ? 300 : 360;
  const yFor = (price: number): number =>
    CHART_HEIGHT * (1 - (price - renderMin) / renderSpan);

  const fmt = (p: number): string =>
    p >= 1000
      ? Math.round(p).toLocaleString()
      : p.toLocaleString(undefined, {
          minimumFractionDigits: p < 10 ? 3 : 2,
          maximumFractionDigits: p < 10 ? 3 : 2,
        });

  const fmtHalfWidth = (hw: number): string => {
    if (hw >= 1000) return Math.round(hw).toLocaleString();
    if (hw >= 10) return hw.toFixed(0);
    if (hw >= 1) return hw.toFixed(2);
    return hw.toFixed(3);
  };

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
    if (halfWidth != null) bits.push(`HW ${fmtHalfWidth(halfWidth)}`);
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
    if (halfWidth != null) bits.push(`HW ${fmtHalfWidth(halfWidth)}`);
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
    <div
      className={cn(
        "flex-1 flex flex-col justify-center min-h-[280px]",
        compact ? "px-2 py-2 sm:px-3 sm:py-3" : "px-3 py-3 sm:px-4 sm:py-4 min-h-[360px]",
      )}
    >
      <div
        className="relative w-full rounded-lg border border-white/[0.06] bg-[#0a0a0c] overflow-hidden"
        style={{ height: CHART_HEIGHT }}
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
            <span
              className={cn(
                "absolute top-0.5 left-1.5 text-[8px] sm:text-[9px] font-mono font-bold text-rose-300/95",
                compact ? "leading-tight max-w-[85%]" : "whitespace-nowrap",
              )}
            >
              {compact ? (
                <>
                  <span className="block">Bear zone</span>
                  <span className="block font-normal text-rose-300/70 truncate" title={bearDetail}>
                    {bearDetail}
                  </span>
                </>
              ) : (
                <>Bear zone {bearDetail}</>
              )}
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

        {/* ── Stop-loss anchors (one HW outside each band) ── */}
        {bullSl != null && (
          <SlAnchorLine
            price={bullSl}
            label="Bull SL"
            active={engineDirection === "BULL"}
            tone="emerald"
            yFor={yFor}
            fmt={fmt}
          />
        )}
        {bearSl != null && (
          <SlAnchorLine
            price={bearSl}
            label="Bear SL"
            active={engineDirection === "BEAR"}
            tone="rose"
            yFor={yFor}
            fmt={fmt}
          />
        )}

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
            <span
              className={cn(
                "absolute bottom-0.5 left-1.5 text-[8px] sm:text-[9px] font-mono font-bold text-emerald-300/95",
                compact ? "leading-tight max-w-[85%]" : "whitespace-nowrap",
              )}
            >
              {compact ? (
                <>
                  <span className="block">Bull zone</span>
                  <span className="block font-normal text-emerald-300/70 truncate" title={bullDetail}>
                    {bullDetail}
                  </span>
                </>
              ) : (
                <>Bull zone {bullDetail}</>
              )}
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

/** Dotted SL level — one half-width outside the zone band. */
function SlAnchorLine({
  price,
  label,
  active,
  tone,
  yFor,
  fmt,
}: {
  price: number;
  label: string;
  active?: boolean;
  tone: "emerald" | "rose";
  yFor: (price: number) => number;
  fmt: (p: number) => string;
}) {
  const isEmerald = tone === "emerald";
  return (
    <div
      className={cn(
        "absolute left-0 right-0 border-t border-dotted",
        active
          ? isEmerald
            ? "border-emerald-400/90"
            : "border-rose-400/90"
          : isEmerald
            ? "border-emerald-500/45"
            : "border-rose-500/45",
      )}
      style={{ top: yFor(price) }}
    >
      <span
        className={cn(
          "absolute left-2 -top-3 text-[9px] font-mono font-bold whitespace-nowrap",
          active
            ? isEmerald
              ? "text-emerald-300"
              : "text-rose-300"
            : isEmerald
              ? "text-emerald-400/75"
              : "text-rose-400/75",
        )}
      >
        {label}
        {active ? " · active" : ""}
      </span>
      <span
        className={cn(
          "absolute right-2 -top-3 text-[9px] font-mono font-bold tabular-nums",
          active
            ? isEmerald
              ? "text-emerald-300"
              : "text-rose-300"
            : isEmerald
              ? "text-emerald-400/75"
              : "text-rose-400/75",
        )}
      >
        ${fmt(price)}
      </span>
    </div>
  );
}
