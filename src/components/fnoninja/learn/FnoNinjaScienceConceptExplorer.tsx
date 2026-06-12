"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ChevronDown, Hand } from "lucide-react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

export type ScienceConceptId = "put" | "call" | "maxPain" | "expiry";

type ConceptConfig = {
  id: ScienceConceptId;
  chipLabel: string;
  chartLabel: string;
  headline: string;
  summary: string;
  analogy: string;
  accent: string;
  accentSoft: string;
  /** Highlight region on the screenshot (percent of chart area). */
  overlay: { top: string; left: string; width: string; height: string; kind: "band" | "line" };
};

const CONCEPTS: ConceptConfig[] = [
  {
    id: "put",
    chipLabel: "Put cluster",
    chartLabel: "Put OI peak — 221k @ 22,500",
    headline: "Support zone (below price)",
    summary:
      "Lots of put contracts sit at 22,500 below spot. Market makers hedging those puts may buy as price falls — often acting like a cushion. Observation only, not a bounce guarantee.",
    analogy: "Think: cushion under price",
    accent: LEVELS_ZONE_CHART.bull.line,
    accentSoft: "rgba(34,197,94,0.45)",
    overlay: { top: "58%", left: "6%", width: "78%", height: "20%", kind: "band" },
  },
  {
    id: "call",
    chipLabel: "Call cluster",
    chartLabel: "Call OI peak — 164k @ 24,000",
    headline: "Resistance zone (above price)",
    summary:
      "Heavy call open interest at 24,000 above spot. Hedging can mean selling into rallies — like a ceiling. Context for your chart, not a guaranteed wall.",
    analogy: "Think: ceiling above price",
    accent: LEVELS_ZONE_CHART.bear.line,
    accentSoft: "rgba(239,68,68,0.45)",
    overlay: { top: "8%", left: "6%", width: "78%", height: "22%", kind: "band" },
  },
  {
    id: "maxPain",
    chipLabel: "Max pain",
    chartLabel: "Max Pain @ 23,500",
    headline: "Expiry reference level",
    summary:
      "Strike where option writers would pay out the least if price settled there. Shown as a yellow line — some researchers watch it as a magnet near expiry, not a rule.",
    analogy: "Think: magnet near expiry",
    accent: LEVELS_ZONE_CHART.maxPain.line,
    accentSoft: "rgba(251,191,36,0.5)",
    overlay: { top: "42%", left: "6%", width: "78%", height: "2.5%", kind: "line" },
  },
  {
    id: "expiry",
    chipLabel: "Expiry",
    chartLabel: "16/06/2026 Expiry",
    headline: "Which option chain we used",
    summary:
      "Zones and max pain come from this contract expiry. When the calendar rolls, clusters can shift — always match this date when you verify on NSE.",
    analogy: "Think: use-by date on the data",
    accent: FNO_ACCENT,
    accentSoft: "rgba(96,165,250,0.35)",
    overlay: { top: "88%", left: "4%", width: "92%", height: "10%", kind: "band" },
  },
];

const CHART_SRC = "/fnoninja/learn/science-chart.png";

function ConceptChip({
  concept,
  active,
  onSelect,
}: {
  concept: ConceptConfig;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-full px-3.5 py-2 text-xs sm:text-sm font-bold transition-all"
      style={{
        color: active ? "#f8fafc" : "#94a3b8",
        backgroundColor: active ? "rgba(37,99,235,0.22)" : "rgba(8,15,30,0.5)",
        border: active
          ? `2px solid ${concept.accent}`
          : "1px solid rgba(90,140,220,0.18)",
        boxShadow: active ? `0 0 20px ${concept.accentSoft}` : "none",
      }}
    >
      {concept.chipLabel}
    </button>
  );
}

function ChartHotspot({
  concept,
  active,
  onSelect,
}: {
  concept: ConceptConfig;
  active: boolean;
  onSelect: () => void;
}) {
  const { overlay } = concept;
  const isLine = overlay.kind === "line";

  return (
    <button
      type="button"
      aria-label={`Highlight ${concept.chipLabel}`}
      onClick={onSelect}
      className="absolute transition-all duration-300 rounded-sm"
      style={{
        top: overlay.top,
        left: overlay.left,
        width: overlay.width,
        height: overlay.height,
        backgroundColor: active ? concept.accentSoft : "transparent",
        border: active
          ? `2px solid ${concept.accent}`
          : isLine
            ? "1px dashed rgba(148,163,184,0.25)"
            : "1px dashed rgba(148,163,184,0.2)",
        boxShadow: active ? `0 0 24px ${concept.accentSoft}` : "none",
        opacity: active ? 1 : 0.35,
      }}
    />
  );
}

export function FnoNinjaScienceConceptExplorer() {
  const [activeId, setActiveId] = useState<ScienceConceptId>("put");
  const [deepOpen, setDeepOpen] = useState(false);

  const active = CONCEPTS.find((c) => c.id === activeId) ?? CONCEPTS[0];

  const cycleConcept = useCallback((dir: 1 | -1) => {
    const idx = CONCEPTS.findIndex((c) => c.id === activeId);
    const next = (idx + dir + CONCEPTS.length) % CONCEPTS.length;
    setActiveId(CONCEPTS[next].id);
  }, [activeId]);

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "#64748b" }}
      >
        <Hand className="h-3.5 w-3.5" style={{ color: FNO_ACCENT }} />
        Tap a concept or highlight on the chart
      </div>

      <div className="flex flex-wrap gap-2">
        {CONCEPTS.map((c) => (
          <ConceptChip
            key={c.id}
            concept={c}
            active={c.id === activeId}
            onSelect={() => setActiveId(c.id)}
          />
        ))}
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: FNO_CARD_BORDER, backgroundColor: FNO_CARD_BG }}
      >
        <div className="relative w-full aspect-[16/10] bg-black/40">
          <Image
            src={CHART_SRC}
            alt="NIFTY chart on FNONINJA — tap zones to explore put cluster, call cluster, max pain, and expiry"
            fill
            className="object-cover object-top select-none"
            sizes="(max-width: 768px) 100vw, 720px"
            priority
          />
          {CONCEPTS.map((c) => (
            <ChartHotspot
              key={c.id}
              concept={c}
              active={c.id === activeId}
              onSelect={() => setActiveId(c.id)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
          <button
            type="button"
            onClick={() => cycleConcept(-1)}
            className="text-xs font-semibold px-2 py-1 rounded-md hover:text-white"
            style={{ color: "#64748b" }}
          >
            ← Prev
          </button>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            {active.chipLabel}
          </span>
          <button
            type="button"
            onClick={() => cycleConcept(1)}
            className="text-xs font-semibold px-2 py-1 rounded-md hover:text-white"
            style={{ color: "#64748b" }}
          >
            Next →
          </button>
        </div>
      </div>

      <div
        className="rounded-xl p-4 sm:p-5 transition-colors duration-300"
        style={{
          backgroundColor: "rgba(8,15,30,0.55)",
          border: `1px solid ${active.accent}55`,
          boxShadow: `0 0 28px ${active.accentSoft}`,
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: active.accent }}>
          {active.chartLabel}
        </p>
        <h3 className="text-lg font-bold text-white mb-2">{active.headline}</h3>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#cbd5e1" }}>
          {active.summary}
        </p>
        <p className="text-xs font-semibold italic" style={{ color: "#94a3b8" }}>
          {active.analogy}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setDeepOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-left transition-colors hover:text-white"
        style={{
          color: "#94a3b8",
          backgroundColor: "rgba(8,15,30,0.35)",
          border: "1px solid rgba(90,140,220,0.12)",
        }}
      >
        <span>Read full explanations (optional)</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${deepOpen ? "rotate-180" : ""}`}
        />
      </button>

      {deepOpen ? (
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          {CONCEPTS.map((c) => (
            <div
              key={c.id}
              className="rounded-lg p-4"
              style={{
                backgroundColor: c.id === activeId ? "rgba(37,99,235,0.08)" : "rgba(8,15,30,0.35)",
                border: `1px solid ${c.id === activeId ? `${c.accent}44` : "rgba(90,140,220,0.1)"}`,
              }}
            >
              <p className="font-bold text-white mb-1">{c.chipLabel}</p>
              <p>{c.summary}</p>
            </div>
          ))}
          <p className="text-xs pt-2" style={{ color: "#64748b" }}>
            Heavy option activity can slow price near clusters (hedging) and pull toward max pain near
            expiry — but levels are dynamic and not predictions. Combine with your own analysis.
          </p>
        </div>
      ) : null}
    </div>
  );
}
