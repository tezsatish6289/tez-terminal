"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
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
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { SimZoneCandlesChart } from "@/components/simulator/SimZoneCandlesChart";

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
  hideCarousel,
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
  /** Slideshow-style split layout — primary ladder only, no carousel. */
  hideCarousel?: boolean;
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
        !footerSlot && (hideCarousel ? "min-h-0 h-full" : "min-h-[400px] lg:min-h-0 lg:h-full"),
        onSelect && "cursor-pointer transition-shadow",
        selected &&
          "ring-2 ring-accent/80 shadow-[0_0_0_1px_rgba(0,212,170,0.25),0_8px_28px_rgba(0,212,170,0.12)]",
        onSelect && !selected && "hover:ring-1 hover:ring-white/20",
      )}
    >
      {/* ── Chrome above chart (split) · or sidebar + ladder (legacy) ── */}
      <div
        className={cn(
          "flex flex-1 min-h-0",
          hideCarousel ? "flex-col" : "flex-col sm:flex-row",
        )}
      >
        <CockpitChromePanel
          hideCarousel={hideCarousel}
          botId={botId}
          label={label}
          ivPct={ivPct}
          spot={spot}
          publicLive={publicLive}
          liveMirroringEnabled={liveMirroringEnabled}
          cardStatus={cardStatus}
          capital={capital}
          cs={cs}
          delta={delta}
          deltaPct={deltaPct}
          botLastRanAt={botLastRanAt}
          zonesRefreshedAt={zonesRefreshedAt}
          settingsSlot={settingsSlot}
        />

        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 min-h-0",
            !hideCarousel && "xl:flex-row min-h-[360px]",
          )}
        >
          <div
            className={cn(
              "flex-1 flex flex-col min-w-0 min-h-0",
              !hideCarousel && "min-h-[360px]",
            )}
          >
            {!suggested ? (
              <div className="flex-1 flex items-center justify-center px-4 py-8">
                <p className="text-[10px] text-muted-foreground/40 text-center">
                  Tap Refresh all to load zones
                </p>
              </div>
            ) : hideCarousel ? (
              <SimZoneCandlesChart
                botId={botId}
                suggested={suggested}
                spot={spot}
              />
            ) : (
              <ZonePriceLadder
                suggested={suggested}
                spot={spot}
                engineDirection={engineDirection}
                compact
                fillHeight={false}
              />
            )}
          </div>

          {!hideCarousel && zoneCarouselItems && zoneCarouselItems.length > 0 && (
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

/** Bot identity, controls, capital, and regime status — sidebar or top chrome. */
function CockpitChromePanel({
  hideCarousel,
  botId,
  label,
  ivPct,
  spot,
  publicLive,
  liveMirroringEnabled,
  cardStatus,
  capital,
  cs,
  delta,
  deltaPct,
  botLastRanAt,
  zonesRefreshedAt,
  settingsSlot,
}: {
  hideCarousel?: boolean;
  botId: CockpitBotId;
  label: string;
  ivPct: number | null;
  spot: number | null;
  publicLive?: boolean;
  liveMirroringEnabled?: boolean;
  cardStatus: CockpitCardStatus;
  capital: number;
  cs: string;
  delta: number;
  deltaPct: number;
  botLastRanAt?: string | null;
  zonesRefreshedAt?: string | null;
  settingsSlot?: React.ReactNode;
}) {
  const headerBlock = (
    <div className="space-y-2.5 min-w-0">
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
  );

  const controlsBlock =
    settingsSlot != null ? (
      <div className={COCKPIT_RAIL_GLASS}>
        <div
          className="w-full"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {settingsSlot}
        </div>
      </div>
    ) : null;

  const performanceBlock = (
    <div className={cn(COCKPIT_RAIL_GLASS, !hideCarousel && "mt-auto", "space-y-3")}>
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
  );

  if (hideCarousel) {
    const regimeLine = cardStatus.detail
      ? `${cardStatus.headline} — ${cardStatus.detail}`
      : cardStatus.headline;

    return (
      <div className="shrink-0 px-2.5 sm:px-3 py-2 border-b border-white/[0.08] bg-[#12121a]">
        <div className="flex flex-col gap-2 min-w-0">
          {/* Row 1 — bot identity + Manual / Config / mode toggles */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <span
                className={cn(
                  "shrink-0 inline-block w-2 h-2 rounded-full",
                  POWER_DOT[cardStatus.power],
                )}
                aria-hidden
              />
              <span className="text-[13px] font-black tracking-tight text-white whitespace-nowrap">
                {label}
              </span>
              <div className="flex items-center gap-1 flex-wrap">
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

            {settingsSlot != null && (
              <div
                className="flex items-center shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {settingsSlot}
              </div>
            )}
          </div>

          {/* Row 2 — capital, delta %, last updated */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-lg font-mono font-black tabular-nums text-white leading-none">
                {cs}
                {capital.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[10px] font-mono font-bold tabular-nums leading-none",
                  delta >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {delta >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta >= 0 ? "+" : ""}
                {deltaPct.toFixed(2)}%
              </span>
            </div>
            <LastRanInline
              botId={botId}
              botLastRanAt={botLastRanAt}
              zonesRefreshedAt={zonesRefreshedAt}
            />
            <span className="text-muted-foreground/35 text-[10px] leading-none" aria-hidden>
              ·
            </span>
            <Link
              href={`/stats?bot=${botId}`}
              className="text-[10px] font-bold lowercase tracking-wide text-muted-foreground/55 hover:text-accent transition-colors shrink-0"
            >
              performance
            </Link>
          </div>

          {/* Row 3 — regime / engine status */}
          {regimeLine ? (
            <p
              className={cn(
                "text-[9px] font-black uppercase tracking-wide leading-snug break-words",
                POWER_TEXT[cardStatus.power],
              )}
            >
              {regimeLine}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 sm:w-[260px] md:w-[280px] lg:w-[300px] xl:w-[320px] flex flex-col gap-4 px-4 py-5 border-b sm:border-b-0 sm:border-r border-white/[0.1] bg-gradient-to-b from-[#1c1c24] to-[#141418]">
      {headerBlock}
      {controlsBlock}
      {performanceBlock}
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

/** Brighter zone fills — same structure as levels chart, tuned for sim cockpit. */
const SIM_ZONE_BAND = {
  bull: {
    fill: "rgba(34, 197, 94, 0.55)",
    fillSoft: "rgba(34, 197, 94, 0.3)",
    border: LEVELS_ZONE_CHART.bull.bandBorderSolid,
    glow: "inset 0 0 52px rgba(34, 197, 94, 0.28), 0 0 32px rgba(34, 197, 94, 0.2)",
    label: LEVELS_ZONE_CHART.bull.labelText,
    labelMuted: LEVELS_ZONE_CHART.bull.labelTextMuted,
  },
  bear: {
    fill: "rgba(239, 68, 68, 0.55)",
    fillSoft: "rgba(239, 68, 68, 0.3)",
    border: LEVELS_ZONE_CHART.bear.bandBorderSolid,
    glow: "inset 0 0 52px rgba(239, 68, 68, 0.28), 0 0 32px rgba(239, 68, 68, 0.2)",
    label: LEVELS_ZONE_CHART.bear.labelText,
    labelMuted: LEVELS_ZONE_CHART.bear.labelTextMuted,
  },
} as const;

const LADDER_THEME = {
  spot: "border-t-[3px] border-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.5)]",
  spotLabel: "text-amber-100",
  mpTodayBorder: "border-sky-400/90 shadow-[0_0_12px_rgba(56,189,248,0.25)]",
  mpTodayText: "text-sky-200",
  mpOtherBorder: "border-slate-300/55",
  mpOtherText: "text-slate-200/90",
} as const;

const LADDER_EDGE_PAD = 0.06;

function zoneBandPaint(
  geom: CSSProperties,
  side: "bull" | "bear",
): CSSProperties {
  const z = SIM_ZONE_BAND[side];
  return {
    ...geom,
    background: `linear-gradient(90deg, ${z.fill}, ${z.fillSoft})`,
    borderTop: `2px solid ${z.border}`,
    borderBottom: `2px solid ${z.border}`,
    boxShadow: z.glow,
  };
}

function ZonePriceLadder({
  suggested,
  spot,
  engineDirection,
  compact = false,
  fillHeight = false,
}: {
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
  engineDirection?: ZoneBotDirection | null;
  compact?: boolean;
  /** Stretch ladder to fill the parent column (simulation split layout). */
  fillHeight?: boolean;
}) {
  const chartHostRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(fillHeight ? 400 : compact ? 300 : 360);

  useEffect(() => {
    if (!fillHeight) return;
    const el = chartHostRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setChartHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillHeight]);
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

  // Uniform Y scale: anchor on SL + zone bands (+ spot). Max pain is mapped
  // separately on the relative corridor between bearLow and bullHigh so an
  // outlier D+2 magnet cannot squash every bot into a different layout.
  const structurePrices: number[] = [];
  if (bullSl != null) structurePrices.push(bullSl);
  if (bearSl != null) structurePrices.push(bearSl);
  if (bullLow != null) structurePrices.push(bullLow);
  if (bullHigh != null) structurePrices.push(bullHigh);
  if (bearLow != null) structurePrices.push(bearLow);
  if (bearHigh != null) structurePrices.push(bearHigh);
  if (spot != null) structurePrices.push(spot);

  if (structurePrices.length < 2) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[10px] text-muted-foreground/40">
          Not enough zone data to render ladder
        </p>
      </div>
    );
  }

  const structureMin =
    bullSl ?? bullLow ?? Math.min(...structurePrices);
  const structureMax =
    bearSl ?? bearHigh ?? Math.max(...structurePrices);
  const structureSpan = Math.max(
    structureMax - structureMin,
    structureMin > 0 ? structureMin * 0.0005 : 1,
  );

  let renderMin = structureMin - structureSpan * LADDER_EDGE_PAD;
  let renderMax = structureMax + structureSpan * LADDER_EDGE_PAD;
  if (spot != null) {
    const spotPad = structureSpan * 0.035;
    if (spot < renderMin) renderMin = spot - spotPad;
    if (spot > renderMax) renderMax = spot + spotPad;
  }
  const renderSpan = Math.max(renderMax - renderMin, 1e-9);

  const yFor = (price: number): number =>
    chartHeight * (1 - (price - renderMin) / renderSpan);

  // Max-pain corridor: gap between bear zone floor and bull zone ceiling.
  const corridorTop = bearLow ?? bearHigh ?? structureMax;
  const corridorBottom = bullHigh ?? bullLow ?? structureMin;
  const corridorSpan = Math.max(corridorTop - corridorBottom, 1e-9);
  const yCorridorTop = yFor(corridorTop);
  const yCorridorBottom = yFor(corridorBottom);

  const yForMaxPain = (mpPrice: number): number => {
    const clamped = Math.min(corridorTop, Math.max(corridorBottom, mpPrice));
    const frac = (corridorTop - clamped) / corridorSpan;
    return yCorridorTop + frac * (yCorridorBottom - yCorridorTop);
  };

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
      ? {
          top: yFor(bullHigh),
          height: Math.max(yFor(bullLow) - yFor(bullHigh), 4),
        }
      : null;
  const bearBandStyle: React.CSSProperties | null =
    bearLow != null && bearHigh != null
      ? {
          top: yFor(bearHigh),
          height: Math.max(yFor(bearLow) - yFor(bearHigh), 4),
        }
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
        "flex flex-col min-h-0",
        fillHeight ? "flex-1 h-full px-1.5 py-1" : "flex-1 justify-center min-h-[280px]",
        !fillHeight && (compact ? "px-2 py-2 sm:px-3 sm:py-3" : "px-3 py-3 sm:px-4 sm:py-4 min-h-[360px]"),
      )}
    >
      <div
        ref={fillHeight ? chartHostRef : undefined}
        className={cn(
          "relative w-full",
          fillHeight ? "flex-1 min-h-0" : undefined,
        )}
        style={fillHeight ? undefined : { height: chartHeight }}
      >
        <div
          className={cn(
            "rounded-lg border border-white/[0.12] bg-[#0a0a0e] overflow-hidden",
            fillHeight ? "absolute inset-0" : "relative w-full h-full",
          )}
        >
        {/* ── Bear band (top) ── */}
        {bearBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0",
              bearIdle && "opacity-70 saturate-75",
            )}
            style={zoneBandPaint(bearBandStyle, "bear")}
          >
            <span
              className={cn(
                "absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[9px] sm:text-[10px] font-bold tracking-wide",
                compact ? "leading-tight max-w-[55%]" : "whitespace-nowrap",
              )}
              style={{ color: SIM_ZONE_BAND.bear.labelMuted }}
            >
              {compact ? (
                <>
                  <span className="block">Bear zone</span>
                  <span
                    className="block font-normal text-[8px] truncate"
                    style={{ color: SIM_ZONE_BAND.bear.label }}
                    title={bearDetail}
                  >
                    {bearDetail}
                  </span>
                </>
              ) : (
                <>Bear zone {bearDetail}</>
              )}
            </span>
            <span
              className="absolute top-0.5 right-2 text-[10px] font-mono font-bold tabular-nums"
              style={{ color: SIM_ZONE_BAND.bear.labelMuted }}
            >
              ${bearHigh != null ? fmt(bearHigh) : "—"}
            </span>
            <span
              className="absolute bottom-0.5 right-2 text-[10px] font-mono font-bold tabular-nums"
              style={{ color: SIM_ZONE_BAND.bear.label }}
            >
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
                "absolute left-0 right-0 border-t-2 border-dashed",
                isToday ? LADDER_THEME.mpTodayBorder : LADDER_THEME.mpOtherBorder,
              )}
              style={{ top: yForMaxPain(g.price) }}
            >
              <span
                className={cn(
                  "absolute left-2 -top-3 text-[9px] font-mono font-black whitespace-nowrap",
                  isToday
                    ? `${LADDER_THEME.mpTodayText} drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]`
                    : LADDER_THEME.mpOtherText,
                )}
              >
                Max pain ({g.labels.join(" & ")})
              </span>
              <span
                className={cn(
                  "absolute right-2 -top-3 text-[9px] font-mono font-black tabular-nums",
                  isToday ? LADDER_THEME.mpTodayText : LADDER_THEME.mpOtherText,
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
            label="Bull Inv."
            active={engineDirection === "BULL"}
            tone="emerald"
            lineColor={LEVELS_ZONE_CHART.bull.lineInv}
            yFor={yFor}
            fmt={fmt}
          />
        )}
        {bearSl != null && (
          <SlAnchorLine
            price={bearSl}
            label="Bear Inv."
            active={engineDirection === "BEAR"}
            tone="rose"
            lineColor={LEVELS_ZONE_CHART.bear.lineInv}
            yFor={yFor}
            fmt={fmt}
          />
        )}

        {/* ── Current price (the anchor) ── */}
        {spot != null && (
          <div
            className={cn("absolute left-0 right-0", LADDER_THEME.spot)}
            style={{ top: yFor(spot) }}
          >
            <span className={cn("absolute left-2 -top-3.5 text-[10px] font-mono font-black whitespace-nowrap drop-shadow-[0_0_8px_rgba(252,211,77,0.6)]", LADDER_THEME.spotLabel)}>
              Current price
            </span>
            <span className={cn("absolute right-2 -top-3.5 text-[11px] font-mono font-black tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]", LADDER_THEME.spotLabel)}>
              ${fmt(spot)}
            </span>
          </div>
        )}

        {/* ── Bull band ── */}
        {bullBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0",
              bullIdle && "opacity-70 saturate-75",
            )}
            style={zoneBandPaint(bullBandStyle, "bull")}
          >
            <span
              className="absolute top-0.5 right-2 text-[10px] font-mono font-bold tabular-nums"
              style={{ color: SIM_ZONE_BAND.bull.label }}
            >
              ${bullHigh != null ? fmt(bullHigh) : "—"}
            </span>
            <span
              className={cn(
                "absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[9px] sm:text-[10px] font-bold tracking-wide",
                compact ? "leading-tight max-w-[55%]" : "whitespace-nowrap",
              )}
              style={{ color: SIM_ZONE_BAND.bull.label }}
            >
              {compact ? (
                <>
                  <span className="block">Bull zone</span>
                  <span
                    className="block font-normal text-[8px] truncate"
                    style={{ color: SIM_ZONE_BAND.bull.labelMuted }}
                    title={bullDetail}
                  >
                    {bullDetail}
                  </span>
                </>
              ) : (
                <>Bull zone {bullDetail}</>
              )}
            </span>
            <span
              className="absolute bottom-0.5 right-2 text-[10px] font-mono font-bold tabular-nums"
              style={{ color: SIM_ZONE_BAND.bull.labelMuted }}
            >
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
      </div>

      {(!bullBandStyle || !bearBandStyle) && (
        <p className="shrink-0 text-[9px] text-muted-foreground/45 italic mt-1.5 text-center">
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
  lineColor,
  yFor,
  fmt,
}: {
  price: number;
  label: string;
  active?: boolean;
  tone: "emerald" | "rose";
  lineColor: string;
  yFor: (price: number) => number;
  fmt: (p: number) => string;
}) {
  const labelColor =
    tone === "emerald"
      ? LEVELS_ZONE_CHART.bull.labelText
      : LEVELS_ZONE_CHART.bear.labelText;
  return (
    <div
      className="absolute left-0 right-0 border-t-2 border-dotted"
      style={{
        top: yFor(price),
        borderColor: lineColor,
        boxShadow: active ? `0 0 12px ${lineColor}55` : undefined,
        opacity: active ? 1 : 0.85,
      }}
    >
      <span
        className="absolute left-2 -top-3 text-[9px] font-mono font-black whitespace-nowrap"
        style={{ color: labelColor }}
      >
        {label}
        {active ? " · active" : ""}
      </span>
      <span
        className="absolute right-2 -top-3 text-[9px] font-mono font-black tabular-nums"
        style={{ color: labelColor }}
      >
        ${fmt(price)}
      </span>
    </div>
  );
}
