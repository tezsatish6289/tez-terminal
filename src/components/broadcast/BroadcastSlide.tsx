"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnimatedNumber, useChartMotion } from "@/hooks/use-chart-motion";
import type { LevelsActionableItem } from "@/lib/zones/levels-actionable-list";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import { zoneStatusDisplayKey, type ZoneDisplayKey } from "@/lib/zones/zone-status";
import {
  formatClusterContracts,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  FNO_ACCENT,
  FNO_BG_CANVAS,
  FNO_BG_TEXTURE,
  FNO_BG_TEXTURE_SIZE,
  FNO_MUTED,
  FNO_TEXT,
} from "@/lib/fnoninja/theme";
import { BroadcastNews } from "./BroadcastNews";
import { useBroadcastNews } from "./useBroadcastNews";

const SUPPORT = "#34d399";
const RESIST = "#f87171";
const MUTED = FNO_MUTED;
const INK = FNO_TEXT;
const MAX_PAIN = LEVELS_ZONE_CHART.maxPain.labelText;
const PANE_BORDER = "1px solid rgba(90,140,220,0.2)";

/** Match BroadcastScene cross-fade so digits finish rolling as the page lands. */
const KINETIC_MS = 900;

const SLIDE_CSS = `
@keyframes broadcast-slide-in {
  0% { opacity: 0; transform: translate3d(0, 14px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
.broadcast-slide-in { animation: broadcast-slide-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes broadcast-kinetic-num {
  0% { opacity: 0.35; transform: translateY(0.12em); filter: blur(3px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}
.broadcast-kinetic-num { animation: broadcast-kinetic-num ${KINETIC_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

/**
 * Count up once per `rollKey` when `target` first becomes available.
 * Wall stats often load a beat after spot (compact in-zone row → full ladder fetch),
 * so we lock the end value on arrival instead of snapshotting at symbol change.
 */
function KineticNumber({
  rollKey,
  target,
  format,
  className,
  style,
  hideWhenEmpty = false,
}: {
  rollKey: string;
  target: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
  hideWhenEmpty?: boolean;
}) {
  const { enabled } = useChartMotion();
  const [endValue, setEndValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    setEndValue(null);
    setRolling(false);
  }, [rollKey]);

  useEffect(() => {
    if (endValue != null) return;
    if (target == null || !Number.isFinite(target)) return;
    setEndValue(target);
    if (!enabled) return;
    setRolling(true);
    const id = window.setTimeout(() => setRolling(false), KINETIC_MS);
    return () => window.clearTimeout(id);
  }, [rollKey, target, endValue, enabled]);

  const display = rolling ? endValue : (target ?? endValue);
  const canAnimate =
    rolling && endValue != null && display != null && Number.isFinite(display);
  const animated = useAnimatedNumber(endValue ?? display ?? 0, {
    enabled: canAnimate,
    duration: KINETIC_MS,
  });

  if (display == null || !Number.isFinite(display)) {
    if (hideWhenEmpty) return null;
    return (
      <span className={className} style={style}>
        —
      </span>
    );
  }

  return (
    <span
      className={rolling ? `broadcast-kinetic-num ${className ?? ""}`.trim() : className}
      style={style}
    >
      {format(rolling ? animated : display)}
    </span>
  );
}

const STATUS_META: Record<ZoneDisplayKey, { label: string; color: string }> = {
  IN_BULL: { label: "AT SUPPORT", color: SUPPORT },
  NEAR_BULL: { label: "NEAR SUPPORT", color: SUPPORT },
  IN_BEAR: { label: "AT RESISTANCE", color: RESIST },
  NEAR_BEAR: { label: "NEAR RESISTANCE", color: RESIST },
  NEUTRAL: { label: "IN RANGE", color: MUTED },
  ILLIQUID: { label: "THIN OI", color: MUTED },
};

function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function oi(n: number | null | undefined): string {
  return formatClusterContracts(n) ?? "—";
}

function wallStrike(strike: number | null | undefined): string {
  const s = formatClusterStrike(strike);
  return s ? `₹${s}` : "—";
}

function Stat({
  label,
  rollKey,
  valueTarget,
  formatValue,
  subTarget,
  formatSub,
  color,
}: {
  label: string;
  rollKey: string;
  valueTarget: number | null | undefined;
  formatValue: (n: number) => string;
  subTarget?: number | null;
  formatSub?: (n: number) => string;
  color?: string;
}) {
  const c = color ?? INK;
  const subFmt = formatSub ?? ((n: number) => String(n));

  return (
    <div
      className="flex flex-col justify-center rounded-lg"
      style={{
        padding: "1.3vh 1.2vh",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${c}44`,
      }}
    >
      <span
        style={{
          fontSize: "1.2vh",
          color: MUTED,
          letterSpacing: "0.08em",
          fontWeight: 800,
        }}
      >
        {label}
      </span>
      <KineticNumber
        rollKey={rollKey}
        target={valueTarget}
        format={formatValue}
        className="font-mono tabular-nums font-black"
        style={{ fontSize: "2.35vh", color: c, marginTop: "0.55vh" }}
      />
      {formatSub && (
        <KineticNumber
          rollKey={`${rollKey}-sub`}
          target={subTarget}
          format={subFmt}
          hideWhenEmpty
          className="font-mono tabular-nums"
          style={{
            fontSize: "1.5vh",
            color: c,
            fontWeight: 700,
            marginTop: "0.35vh",
            opacity: 0.9,
          }}
        />
      )}
    </div>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <span
      className="rounded-full font-bold"
      style={{
        padding: "0.55vh 1.3vh",
        fontSize: "1.35vh",
        color: FNO_ACCENT,
        background: "rgba(37,99,235,0.12)",
        border: "1px solid rgba(96,165,250,0.3)",
      }}
    >
      {text}
    </span>
  );
}

/** Descriptive levels card for one stock (used in the single-stock focus page). */
export function BroadcastSlide({
  item,
  rollKey,
}: {
  item: LevelsActionableItem;
  /** Changes each time this stock appears in the rotation (not just on symbol). */
  rollKey: string;
}) {
  const d = item.data;
  const bands = bandsFromLevels(d, item.spot);
  const status = STATUS_META[zoneStatusDisplayKey(bands)];
  const { news } = useBroadcastNews(item.scope, item.symbol);

  const chips: string[] = [];
  if (d?.atmIV != null) chips.push(`IV ${d.atmIV.toFixed(1)}%`);
  if (d?.volRegime && d.volRegime !== "UNKNOWN") chips.push(d.volRegime);
  if (d?.daysToEarnings != null && d.daysToEarnings >= 0 && d.daysToEarnings <= 5) {
    chips.push(`Earnings ${d.daysToEarnings}d`);
  }

  const subtitleLine = useMemo(() => {
    const candidates = [
      item.scope === "stock" ? fnoCompanyName(item.symbol) : null,
      item.label,
      news?.name,
    ];
    for (const name of candidates) {
      if (name && name.toUpperCase() !== item.symbol) return name;
    }
    return null;
  }, [item.scope, item.symbol, item.label, news?.name]);

  return (
    <div
      key={item.symbol}
      className="broadcast-slide-in relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{
        backgroundColor: FNO_BG_CANVAS,
        backgroundImage: FNO_BG_TEXTURE,
        backgroundSize: FNO_BG_TEXTURE_SIZE,
        margin: "-2vh",
        padding: "2vh",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />

      {/* Symbol + status */}
      <div className="flex items-start justify-between" style={{ gap: "1.2vh" }}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline" style={{ gap: "1.1vh" }}>
            <span
              className="font-black truncate"
              style={{ fontSize: "3.6vh", color: INK, letterSpacing: "-0.01em" }}
            >
              {item.symbol}
            </span>
            <span
              style={{
                fontSize: "1.15vh",
                fontWeight: 800,
                color: MUTED,
                letterSpacing: "0.1em",
                border: PANE_BORDER,
                borderRadius: "0.5vh",
                padding: "0.35vh 0.75vh",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {item.scope === "index" ? "INDEX" : "STOCK"}
            </span>
          </div>
          {subtitleLine && (
            <span
              className="truncate uppercase"
              style={{ fontSize: "1.35vh", color: MUTED, marginTop: "0.45vh", letterSpacing: "0.04em" }}
            >
              {subtitleLine}
            </span>
          )}
        </div>
        <span
          className="font-black shrink-0 rounded-lg"
          style={{
            fontSize: "1.55vh",
            color: status.color,
            background: `${status.color}14`,
            border: `1px solid ${status.color}55`,
            padding: "0.65vh 1.4vh",
            letterSpacing: "0.06em",
          }}
        >
          {status.label}
        </span>
      </div>

      {/* Spot + context chips */}
      <div
        className="flex items-center justify-between"
        style={{ gap: "1.2vh", marginTop: "1.8vh" }}
      >
        <div className="flex items-baseline min-w-0" style={{ gap: "0.9vh" }}>
          <span style={{ fontSize: "1.5vh", color: MUTED, fontWeight: 800, letterSpacing: "0.06em" }}>
            SPOT
          </span>
          <span style={{ fontSize: "4.4vh", color: INK }}>
            <KineticNumber
              rollKey={`${rollKey}-spot`}
              target={item.spot}
              format={(n) => `₹${inr(n)}`}
              className="font-mono tabular-nums font-black"
            />
          </span>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center justify-end shrink-0" style={{ gap: "0.8vh" }}>
            {chips.map((c) => (
              <Chip key={c} text={c} />
            ))}
          </div>
        )}
      </div>

      {/* Stats — max pain + option walls */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "1vh", marginTop: "1.8vh" }}
      >
        <Stat
          label="MAX PAIN"
          rollKey={`${rollKey}-poc`}
          valueTarget={d?.poc}
          formatValue={(n) => `₹${inr(n)}`}
          color={MAX_PAIN}
        />
        <Stat
          label="PUT WALL"
          rollKey={`${rollKey}-put`}
          valueTarget={d?.putClusterStrike}
          formatValue={(n) => wallStrike(n)}
          subTarget={d?.putClusterSize}
          formatSub={(n) => `${oi(Math.round(n))} contracts`}
          color={SUPPORT}
        />
        <Stat
          label="CALL WALL"
          rollKey={`${rollKey}-call`}
          valueTarget={d?.callClusterStrike}
          formatValue={(n) => wallStrike(n)}
          subTarget={d?.callClusterSize}
          formatSub={(n) => `${oi(Math.round(n))} contracts`}
          color={RESIST}
        />
      </div>

      <BroadcastNews scope={item.scope} symbol={item.symbol} />
    </div>
  );
}
