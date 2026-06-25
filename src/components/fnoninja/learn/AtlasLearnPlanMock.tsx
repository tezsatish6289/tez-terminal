"use client";

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  formatClusterContracts,
  formatClusterPeakLabel,
} from "@/lib/levels/format-cluster-size";
import { FNO_CARD_BG, FNO_MUTED, FNO_TEXT } from "@/lib/fnoninja/theme";

function fmtLevel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n >= 1000
    ? `₹${Math.round(n).toLocaleString("en-IN")}`
    : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const CARD_STYLE = {
  backgroundColor: FNO_CARD_BG,
  border: "1px solid rgba(96,165,250,0.2)",
} as const;

/**
 * Illustrates Atlas output shape with live key levels — not a generated strategy.
 * Real hedged structures only appear when the user opens Atlas on the chart.
 */
export function AtlasLearnPlanMock({ levels }: { levels: PublicLevels | null }) {
  const support = levels?.bullLow ?? levels?.putClusterStrike ?? null;
  const resistance = levels?.bearHigh ?? levels?.callClusterStrike ?? null;
  const maxPain = levels?.poc ?? null;
  const putWall = formatClusterPeakLabel(
    "Put",
    levels?.putClusterSize,
    levels?.putClusterStrike,
    levels?.putClusterChange,
  );
  const callWall = formatClusterPeakLabel(
    "Call",
    levels?.callClusterSize,
    levels?.callClusterStrike,
    levels?.callClusterChange,
  );

  const levelRows: [string, string | null][] = [
    ["Support", fmtLevel(support)],
    ["Resistance", fmtLevel(resistance)],
    ["Max pain", fmtLevel(maxPain)],
    ["Put OI wall", putWall],
    ["Call OI wall", callWall],
  ].filter(([, v]) => v) as [string, string | null][];

  const putSize = formatClusterContracts(levels?.putClusterSize);
  const callSize = formatClusterContracts(levels?.callClusterSize);

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          color: "#fcd34d",
          backgroundColor: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.25)",
        }}
      >
        Example layout — open Atlas on the chart for today&apos;s hedged plan
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
          style={{ color: "#6ee7b7", border: "1px solid rgba(110,231,183,0.35)", backgroundColor: "rgba(110,231,183,0.1)" }}
        >
          lean bullish
        </span>
        <span className="text-[10px]" style={{ color: FNO_MUTED }}>
          Sample bias badge
        </span>
      </div>

      <p className="text-sm font-semibold" style={{ color: FNO_TEXT }}>
        Support below spot with defined-risk structures
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
        Atlas reads today&apos;s zones, OI walls, and IV regime for this symbol, then lays out
        hedged scenarios with max risk visible up front.
        {levels?.spot != null ? (
          <>
            {" "}
            Live spot:{" "}
            <span className="font-mono text-amber-200/90">
              {Math.round(levels.spot).toLocaleString("en-IN")}
            </span>
            .
          </>
        ) : null}
      </p>

      {levelRows.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {levelRows.map(([k, v]) => (
            <div key={k} className="rounded-lg px-3 py-2" style={CARD_STYLE}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: FNO_MUTED }}>
                {k}
              </p>
              <p className="text-xs font-semibold leading-snug" style={{ color: FNO_TEXT }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: FNO_MUTED }}>
          Key levels appear here once live NIFTY data loads.
        </p>
      )}

      <div className="rounded-xl p-3.5" style={CARD_STYLE}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold" style={{ color: FNO_TEXT }}>
            Bull put spread
          </p>
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ color: "#34d399", backgroundColor: "rgba(52,211,153,0.12)" }}
          >
            bullish
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
          Example structure type — Atlas picks strikes from live data when you request a plan.
          {putSize ? ` Put wall context: ${putSize} contracts at support.` : ""}
          {callSize ? ` Call wall: ${callSize} above.` : ""}
        </p>
        <div
          className="mt-2 rounded-lg px-2.5 py-2 text-[11px] font-mono"
          style={{
            background: FNO_CARD_BG,
            color: "#bfdbfe",
            border: "1px solid rgba(96,165,250,0.25)",
          }}
        >
          Sell put @ support − buffer · Buy put lower · Defined max loss
        </div>
        <dl className="mt-2.5 space-y-1 text-[11px]">
          <PlanRow label="Max risk" value="Shown per share · multiply by lot size" valueColor="#fca5a5" />
          <PlanRow label="Max reward" value="Shown per share · credit or debit net" valueColor="#6ee7b7" />
          <PlanRow label="Invalidation" value="Below support / wall break" valueColor="#fca5a5" />
        </dl>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: FNO_MUTED }}>
        Strikes, economics, and invalidation levels are generated on demand — not embedded in this
        guide — so nothing here goes stale or reads like a trade recommendation.
      </p>
    </div>
  );
}

function PlanRow({
  label,
  value,
  valueColor = "#e2e8f0",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 w-20" style={{ color: FNO_MUTED }}>
        {label}
      </dt>
      <dd style={{ color: valueColor }}>{value}</dd>
    </div>
  );
}
