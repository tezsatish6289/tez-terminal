"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  atlasScoreBucket,
  atlasScoreTone,
  type AtlasProbEmphasis,
  type AtlasSideThesis,
} from "@/lib/levels/atlas-score-calibration";

const SCORE_TONE = {
  strong: {
    color: "#86efac",
    bg: "rgba(34, 197, 94, 0.14)",
    border: "rgba(134, 239, 172, 0.28)",
  },
  mid: {
    color: "#fcd34d",
    bg: "rgba(245, 158, 11, 0.14)",
    border: "rgba(252, 211, 77, 0.28)",
  },
  weak: {
    color: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.14)",
    border: "rgba(252, 165, 165, 0.28)",
  },
} as const;

const UP_STYLE = {
  color: "#86efac",
  bg: "rgba(34, 197, 94, 0.14)",
  border: "rgba(134, 239, 172, 0.28)",
};
const DOWN_STYLE = {
  color: "#fca5a5",
  bg: "rgba(239, 68, 68, 0.14)",
  border: "rgba(252, 165, 165, 0.28)",
};

export type AtlasChartSetup = {
  atlasScore: number;
  up: AtlasSideThesis;
  down: AtlasSideThesis;
  emphasis: AtlasProbEmphasis;
  lowerConfidence?: boolean;
};

function ProbChip({
  kind,
  thesis,
  emphasized,
  muted,
  lowerConfidence,
  chart,
}: {
  kind: "up" | "down";
  thesis: AtlasSideThesis;
  emphasized: boolean;
  muted: boolean;
  lowerConfidence?: boolean;
  chart: boolean;
}) {
  const style = kind === "up" ? UP_STYLE : DOWN_STYLE;
  const arrow = kind === "up" ? "↑" : "↓";
  const label = kind === "up" ? "Up (support thesis)" : "Down (resistance thesis)";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`pointer-events-auto inline-flex items-center gap-0.5 border font-bold tracking-wide shrink-0 leading-tight cursor-help tabular-nums ${
            chart
              ? "px-2 py-1 text-[10px] sm:text-[11px] rounded-lg"
              : "px-1.5 py-0.5 text-[9px] rounded-md"
          }`}
          style={{
            color: style.color,
            backgroundColor: style.bg,
            borderColor: style.border,
            opacity: muted ? 0.45 : emphasized ? 1 : 0.85,
          }}
        >
          <span aria-hidden>{arrow}</span>
          <span>{thesis.probabilityPct}%</span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        align="start"
        className="max-w-[240px] border-white/10 bg-slate-950 px-3 py-2.5 text-left shadow-none"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.color }}>
          {label}
        </p>
        <p className="mt-1 text-lg font-black tabular-nums leading-none" style={{ color: style.color }}>
          {thesis.probabilityPct}%
        </p>
        <p className="mt-1 text-[10px] text-slate-400">
          Atlas {thesis.score} · score bucket {thesis.bucket} · historical win rate{" "}
          {thesis.bucketWinRatePct}%
        </p>
        {lowerConfidence ? (
          <p className="mt-1 text-[10px] text-amber-200/80">Lower confidence — limited PVT confirmation.</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Chart corner: Atlas score + ↑ / ↓ calibrated probabilities.
 * Emphasis follows geography (in/near zone); between zones both probs are equal weight.
 */
export function AtlasSetupScoreBadge({
  setup,
  /** @deprecated Prefer `setup` — kept for single-score call sites. */
  score,
  size = "chart",
  /** `stack` = score above ↑/↓ (chart corner). `inline` = one horizontal group (chrome). */
  orientation,
  className = "",
}: {
  setup?: AtlasChartSetup | null;
  score?: number;
  size?: "chart" | "header";
  orientation?: "stack" | "inline";
  className?: string;
}) {
  const chart = size === "chart";
  const inline = (orientation ?? (size === "header" ? "inline" : "stack")) === "inline";

  // Legacy: score-only badge
  if (!setup) {
    if (score == null || !Number.isFinite(score)) return null;
    const composite = Math.round(score);
    const bucket = atlasScoreBucket(composite);
    const tone = atlasScoreTone(composite);
    const style = SCORE_TONE[tone];
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`pointer-events-auto inline-flex items-center gap-1 border font-bold uppercase tracking-wide shrink-0 leading-tight cursor-help ${
                chart
                  ? "px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg"
                  : "px-2 py-0.5 text-[9px] sm:text-[10px] rounded-md"
              } ${className}`.trim()}
              style={{
                color: style.color,
                backgroundColor: style.bg,
                borderColor: style.border,
              }}
            >
              <span className="opacity-70 font-semibold normal-case tracking-normal">Atlas</span>
              <span className="tabular-nums">{composite}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="start"
            className="max-w-[220px] border-white/10 bg-slate-950 px-3 py-2.5 text-left shadow-none"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.color }}>
              Score {bucket.label}
            </p>
            <p className="mt-1 text-lg font-black tabular-nums leading-none" style={{ color: style.color }}>
              {bucket.winRatePct}%
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Historical win rate for this Atlas score bucket (resolved zone entries).
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const composite = Math.round(setup.atlasScore);
  const bucket = atlasScoreBucket(composite);
  const tone = atlasScoreTone(composite);
  const style = SCORE_TONE[tone];
  const upMuted = setup.emphasis === "down";
  const downMuted = setup.emphasis === "up";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`flex shrink-0 gap-1 ${
          inline ? "flex-row items-center" : "flex-col items-end"
        } ${className}`.trim()}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`pointer-events-auto inline-flex items-center gap-1 border font-bold uppercase tracking-wide shrink-0 leading-tight cursor-help ${
                chart
                  ? "px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg"
                  : "px-2 py-0.5 text-[9px] sm:text-[10px] rounded-md"
              }`}
              style={{
                color: style.color,
                backgroundColor: style.bg,
                borderColor: style.border,
              }}
            >
              <span className="opacity-70 font-semibold normal-case tracking-normal">Atlas</span>
              <span className="tabular-nums">{composite}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="start"
            className="max-w-[240px] border-white/10 bg-slate-950 px-3 py-2.5 text-left shadow-none"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.color }}>
              Atlas setup score
            </p>
            <p className="mt-1 text-lg font-black tabular-nums leading-none" style={{ color: style.color }}>
              {composite}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Bucket {bucket.label} · historical win rate {bucket.winRatePct}% for similar
              resolved zone entries. ↑ / ↓ map each side’s score to that rate.
            </p>
            {setup.lowerConfidence ? (
              <p className="mt-1 text-[10px] text-amber-200/80">
                Lower confidence — limited PVT confirmation.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1 shrink-0">
          <ProbChip
            kind="up"
            thesis={setup.up}
            emphasized={setup.emphasis === "up" || setup.emphasis === "both"}
            muted={upMuted}
            lowerConfidence={setup.lowerConfidence}
            chart={chart}
          />
          <ProbChip
            kind="down"
            thesis={setup.down}
            emphasized={setup.emphasis === "down" || setup.emphasis === "both"}
            muted={downMuted}
            lowerConfidence={setup.lowerConfidence}
            chart={chart}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
