"use client";

import { useMemo } from "react";
import type { LevelsActionableItem } from "@/lib/zones/levels-actionable-list";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import { zoneStatusDisplayKey, type ZoneDisplayKey } from "@/lib/zones/zone-status";
import {
  formatClusterContracts,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { BroadcastNews } from "./BroadcastNews";

const SUPPORT = "#34d399";
const RESIST = "#f87171";
const MUTED = "#64748b";
const INK = "#f0f4ff";
const MAX_PAIN = LEVELS_ZONE_CHART.maxPain.labelText;

const SLIDE_CSS = `
@keyframes broadcast-slide-in {
  0% { opacity: 0; transform: translate3d(0, 14px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
.broadcast-slide-in { animation: broadcast-slide-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

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

/** Compact Indian-notation OI (e.g. 1.2 Cr, 3.4 L, 12K). */
function oi(n: number | null | undefined): string {
  return formatClusterContracts(n) ?? "—";
}

function wallStrike(strike: number | null | undefined): string {
  const s = formatClusterStrike(strike);
  return s ? `₹${s}` : "—";
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="flex flex-col justify-center rounded-lg"
      style={{
        padding: "1.2vh 1.4vh",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(90,140,220,0.14)",
      }}
    >
      <span style={{ fontSize: "1.25vh", color: MUTED, letterSpacing: "0.06em", fontWeight: 700 }}>
        {label}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ fontSize: "2.1vh", color: color ?? INK, fontWeight: 700, marginTop: "0.5vh" }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: "1.65vh", color: color ?? INK, fontWeight: 600, marginTop: "0.35vh", opacity: 0.9 }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <span
      className="rounded-full"
      style={{
        padding: "0.5vh 1.2vh",
        fontSize: "1.3vh",
        fontWeight: 700,
        color: "#93c5fd",
        background: "rgba(37,99,235,0.12)",
        border: "1px solid rgba(96,165,250,0.3)",
      }}
    >
      {text}
    </span>
  );
}

/** Descriptive levels card for one stock (used in the single-stock focus page). */
export function BroadcastSlide({ item }: { item: LevelsActionableItem }) {
  const d = item.data;
  const bands = bandsFromLevels(d, item.spot);
  const status = STATUS_META[zoneStatusDisplayKey(bands)];

  const putOi = oi(d?.putClusterSize);
  const callOi = oi(d?.callClusterSize);

  const chips: string[] = [];
  if (d?.atmIV != null) chips.push(`IV ${d.atmIV.toFixed(1)}%`);
  if (d?.volRegime && d.volRegime !== "UNKNOWN") chips.push(d.volRegime);
  if (d?.daysToEarnings != null && d.daysToEarnings >= 0 && d.daysToEarnings <= 5) {
    chips.push(`Earnings ${d.daysToEarnings}d`);
  }

  const subtitleLine = useMemo(() => {
    if (item.scope === "stock") {
      const full = fnoCompanyName(item.symbol);
      if (full && full.toUpperCase() !== item.symbol) return full;
      if (item.label && item.label.toUpperCase() !== item.symbol) return item.label;
      return null;
    }
    if (item.label && item.label.toUpperCase() !== item.symbol) return item.label;
    return null;
  }, [item.scope, item.symbol, item.label]);

  return (
    <div key={item.symbol} className="broadcast-slide-in flex flex-col flex-1 min-h-0">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />

      {/* Symbol + status */}
      <div className="flex items-start justify-between" style={{ gap: "1.2vh" }}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline" style={{ gap: "1.1vh" }}>
            <span
              className="font-black truncate"
              style={{ fontSize: "3.4vh", color: INK, letterSpacing: "-0.01em" }}
            >
              {item.symbol}
            </span>
            <span
              style={{
                fontSize: "1.2vh",
                fontWeight: 800,
                color: MUTED,
                letterSpacing: "0.08em",
                border: "1px solid rgba(90,140,220,0.25)",
                borderRadius: "0.4vh",
                padding: "0.3vh 0.7vh",
              }}
            >
              {item.scope === "index" ? "INDEX" : "STOCK"}
            </span>
          </div>
          {subtitleLine && (
            <span className="truncate" style={{ fontSize: "1.5vh", color: MUTED, marginTop: "0.3vh" }}>
              {subtitleLine}
            </span>
          )}
        </div>
        <span
          className="font-black shrink-0 rounded-lg"
          style={{
            fontSize: "1.7vh",
            color: status.color,
            background: `${status.color}1f`,
            border: `1px solid ${status.color}55`,
            padding: "0.7vh 1.2vh",
            letterSpacing: "0.04em",
          }}
        >
          {status.label}
        </span>
      </div>

      {/* Spot */}
      <div className="flex items-baseline" style={{ gap: "0.8vh", marginTop: "1.6vh" }}>
        <span style={{ fontSize: "1.6vh", color: MUTED, fontWeight: 700 }}>SPOT</span>
        <span
          className="font-mono tabular-nums font-black"
          style={{ fontSize: "4vh", color: INK }}
        >
          ₹{inr(item.spot)}
        </span>
      </div>

      {/* Stats — three boxes: max pain (amber) + the two option walls with OI. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "1.1vh", marginTop: "1.6vh" }}
      >
        <Stat label="MAX PAIN" value={`₹${inr(d?.poc)}`} color={MAX_PAIN} />
        <Stat
          label="PUT WALL"
          value={wallStrike(d?.putClusterStrike)}
          sub={putOi !== "—" ? `${putOi} contracts` : undefined}
          color={SUPPORT}
        />
        <Stat
          label="CALL WALL"
          value={wallStrike(d?.callClusterStrike)}
          sub={callOi !== "—" ? `${callOi} contracts` : undefined}
          color={RESIST}
        />
      </div>

      {/* Context chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center" style={{ gap: "0.9vh", marginTop: "1.4vh" }}>
          {chips.map((c) => (
            <Chip key={c} text={c} />
          ))}
        </div>
      )}

      {/* Rolling recent news fills the freed space below. */}
      <BroadcastNews scope={item.scope} symbol={item.symbol} />
    </div>
  );
}
