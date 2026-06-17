"use client";

import type { LevelsActionableItem } from "@/lib/zones/levels-actionable-list";
import { bandsFromLevels } from "@/lib/zones/levels-actionable-list";
import { zoneStatusDisplayKey, type ZoneDisplayKey } from "@/lib/zones/zone-status";

const SUPPORT = "#34d399";
const RESIST = "#f87171";
const MUTED = "#64748b";
const INK = "#f0f4ff";

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

function band(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null || high == null) return "—";
  return `${inr(low)} – ${inr(high)}`;
}

/** Compact Indian-notation OI (e.g. 1.2 Cr, 3.4 L, 12K). */
function oi(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
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
export function BroadcastSlide({
  item,
  index,
  total,
}: {
  item: LevelsActionableItem;
  index?: number;
  total?: number;
}) {
  const d = item.data;
  const bands = bandsFromLevels(d, item.spot);
  const status = STATUS_META[zoneStatusDisplayKey(bands)];
  const isSupport = status.color === SUPPORT;

  const chips: string[] = [];
  if (d?.atmIV != null) chips.push(`IV ${d.atmIV.toFixed(1)}%`);
  if (d?.volRegime && d.volRegime !== "UNKNOWN") chips.push(d.volRegime);
  if (d?.daysToEarnings != null && d.daysToEarnings >= 0 && d.daysToEarnings <= 5) {
    chips.push(`Earnings ${d.daysToEarnings}d`);
  }

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
          <span className="truncate" style={{ fontSize: "1.5vh", color: MUTED, marginTop: "0.3vh" }}>
            {item.label}
          </span>
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

      {/* Stats grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: "1.1vh", marginTop: "1.6vh" }}
      >
        <Stat label="SUPPORT ZONE" value={band(d?.bullLow, d?.bullHigh)} color={SUPPORT} />
        <Stat label="RESISTANCE ZONE" value={band(d?.bearLow, d?.bearHigh)} color={RESIST} />
        <Stat label="MAX PAIN" value={`₹${inr(d?.poc)}`} />
        <Stat
          label={isSupport ? "PUT WALL (SUPPORT)" : "CALL WALL (RESIST)"}
          value={
            isSupport
              ? `₹${inr(d?.putClusterStrike)} · ${oi(d?.putClusterSize)}`
              : `₹${inr(d?.callClusterStrike)} · ${oi(d?.callClusterSize)}`
          }
          color={isSupport ? SUPPORT : RESIST}
        />
      </div>

      {/* Context chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center" style={{ gap: "0.9vh", marginTop: "1.6vh" }}>
          {chips.map((c) => (
            <Chip key={c} text={c} />
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Rotation progress (only when shown as part of a multi-slide rotation) */}
      {index != null && total != null && total > 1 && (
        <div className="flex items-center justify-between" style={{ marginTop: "1.4vh" }}>
          <div className="flex items-center" style={{ gap: "0.6vh" }}>
            {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === index % Math.min(total, 12) ? "2.4vh" : "0.9vh",
                  height: "0.9vh",
                  borderRadius: "999px",
                  background:
                    i === index % Math.min(total, 12) ? "#60a5fa" : "rgba(96,165,250,0.25)",
                  transition: "width 0.3s ease",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: "1.35vh", color: MUTED, fontWeight: 700 }}>
            {index + 1} / {total}
          </span>
        </div>
      )}
    </div>
  );
}
