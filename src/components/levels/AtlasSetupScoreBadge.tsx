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
} from "@/lib/levels/atlas-score-calibration";

const TONE_STYLE = {
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

/**
 * Chart corner badge: shows Atlas composite score. Hover reveals the SR-audit
 * calibration bucket + historical win rate (same framing as /admin/sr-audit).
 */
export function AtlasSetupScoreBadge({
  score,
  size = "chart",
  className = "",
}: {
  score: number;
  size?: "chart" | "header";
  className?: string;
}) {
  if (!Number.isFinite(score)) return null;
  const composite = Math.round(score);
  const bucket = atlasScoreBucket(composite);
  const tone = atlasScoreTone(composite);
  const style = TONE_STYLE[tone];
  const chart = size === "chart";

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
          <p
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: style.color }}
          >
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
