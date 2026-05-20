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
import {
  shortBotStatusDetail,
  type CockpitBotStatus,
} from "@/lib/cockpit-bot-status";

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
  const zoneLine = suggested ? zoneStatusLine(suggested) : "—";
  const day0Pain = suggested?.maxPainByExpiry?.find((e) => e.dayIndex === 0);

  const hasAlert =
    suggested?.signalConflict === true || suggested?.insufficientGap === true;
  const alertText = suggested?.signalConflict
    ? "Day 0 / Day 1 max pain disagree"
    : suggested?.insufficientGap
      ? "Bull & bear zones too tight"
      : null;

  const zoneLineColor =
    !suggested
      ? "text-muted-foreground/40"
      : suggested.signalConflict || suggested.insufficientGap
        ? "text-amber-400"
        : suggested.inPanicRegime
          ? "text-rose-400"
          : "text-muted-foreground/55";

  return (
    <div
      className={cn(
        SIM_CARD,
        "flex flex-col h-full min-h-[400px] overflow-hidden",
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
            <div className="shrink-0">{settingsSlot}</div>
          )}
        </div>

        <p className="text-[12px] font-mono font-bold text-foreground/85 mt-2 tabular-nums leading-none">
          ${formatSpot(spot)}
        </p>
        <p
          className={cn(
            "text-[10px] font-bold mt-1 h-4 leading-4 truncate",
            zoneLineColor,
          )}
          title={zoneLine}
        >
          {zoneLine}
        </p>
      </div>

      {/* ── Bot ON/OFF — fixed height on every card ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] bg-[#141418] h-[40px] flex items-center">
        <BotPowerBadge status={botStatus} />
      </div>

      {/* ── Capital / Open — fixed height ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] bg-[#121214] h-[52px] grid grid-cols-2 gap-2">
        <BotStatChip
          label="Capital"
          value={`${cs}${capital.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          accent
        />
        <BotStatChip
          label="Open"
          value={String(openCount)}
          sub={openCount === 1 ? "position" : "positions"}
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
            <AlertSlot active={hasAlert} text={alertText} />
            <MaxPainSlot
              value={day0Pain?.maxPain ?? null}
              active={day0Pain != null}
            />
            <div className="grid grid-cols-2 gap-2 min-h-[76px]">
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
            <p className="shrink-0 text-[9px] text-center text-muted-foreground/35 font-mono h-4 leading-4">
              {suggested.halfWidthUsd != null ? (
                <>
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
                </>
              ) : (
                "\u00A0"
              )}
            </p>
          </>
        )}
      </div>
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

function BotPowerBadge({ status }: { status: CockpitBotStatus }) {
  const shortDetail = shortBotStatusDetail(status.detail);

  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border h-9",
        status.power === "on"
          ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-400"
          : status.power === "off"
            ? "border-white/[0.12] bg-white/[0.04] text-muted-foreground/55"
            : "border-amber-500/25 bg-amber-500/10 text-amber-400/90",
      )}
      title={status.detail}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          status.power === "on"
            ? "bg-emerald-400 animate-pulse"
            : status.power === "off"
              ? "bg-muted-foreground/40"
              : "bg-amber-400",
        )}
      />
      <span className="text-[9px] font-black uppercase tracking-wider shrink-0">
        {status.label}
      </span>
      {shortDetail && (
        <span className="text-[9px] font-medium normal-case text-muted-foreground/50 truncate min-w-0">
          {shortDetail}
        </span>
      )}
    </div>
  );
}

function AlertSlot({ active, text }: { active: boolean; text: string | null }) {
  return (
    <div
      className={cn(
        "shrink-0 h-8 rounded-lg border px-2 flex items-center gap-1.5",
        active
          ? "border-amber-400/35 bg-amber-400/[0.1]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      {active && text ? (
        <>
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          <p className="text-[9px] text-amber-300/80 truncate">{text}</p>
        </>
      ) : (
        <p className="text-[9px] text-muted-foreground/25 w-full text-center">—</p>
      )}
    </div>
  );
}

function MaxPainSlot({
  value,
  active,
}: {
  value: number | null;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "shrink-0 h-8 rounded-lg border px-2 flex items-center justify-between",
        active
          ? "border-accent/25 bg-accent/[0.08]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <span
        className={cn(
          "text-[9px] font-bold uppercase tracking-wider",
          active ? "text-accent/60" : "text-muted-foreground/25",
        )}
      >
        Max pain (today)
      </span>
      <span
        className={cn(
          "text-[10px] font-mono font-bold tabular-nums",
          active ? "text-accent" : "text-muted-foreground/25",
        )}
      >
        {active && value != null ? `$${value.toLocaleString()}` : "—"}
      </span>
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
        "rounded-lg border px-2 py-1.5 h-full flex flex-col justify-center",
        accent
          ? "border-accent/20 bg-accent/[0.06]"
          : "border-white/[0.08] bg-[#1a1a1f]",
      )}
    >
      <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/45 leading-none">
        {label}
      </div>
      <div
        className={cn(
          "text-[11px] font-black font-mono tabular-nums leading-tight mt-0.5",
          accent ? "text-accent" : "text-foreground/85",
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
  const hasZone = strike != null && low != null && high != null;

  return (
    <div
      className={cn(
        SIM_INSET_TILE,
        "px-2 py-2 h-full min-h-[76px] flex flex-col",
        isBull
          ? "border-emerald-500/30 bg-emerald-500/[0.08]"
          : "border-rose-500/30 bg-rose-500/[0.08]",
        idle && "opacity-55",
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
        {idle && (
          <span className="text-[7px] font-bold uppercase text-muted-foreground/50 ml-auto">
            idle
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-[44px]">
        {hasZone ? (
          <>
            <p
              className={cn(
                "text-[10px] font-mono font-bold leading-tight truncate",
                isBull ? "text-emerald-300/90" : "text-rose-300/90",
              )}
              title={`$${low!.toLocaleString()}–$${high!.toLocaleString()}`}
            >
              ${low!.toLocaleString()}–${high!.toLocaleString()}
            </p>
            <p className="text-[8px] font-mono text-muted-foreground/45 truncate mt-0.5 h-3">
              {tp != null ? `TP $${tp.toLocaleString()}${tpConf ? ` · ${tpConf}` : ""}` : "\u00A0"}
            </p>
          </>
        ) : (
          <p className="text-[9px] text-muted-foreground/40">No cluster</p>
        )}
      </div>
    </div>
  );
}
