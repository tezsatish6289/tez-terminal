"use client";

import { cn } from "@/lib/utils";

export type PatternType = "A" | "B" | "none" | "early" | null | undefined;

const PATTERN_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  A:     { label: "Pattern A", className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" },
  B:     { label: "Pattern B", className: "bg-teal-500/15 text-teal-400 border border-teal-500/20" },
  none:  { label: "Choppy",    className: "bg-amber-500/15 text-amber-400 border border-amber-500/20" },
  drift: { label: "Drifting",  className: "bg-rose-500/15 text-rose-400 border border-rose-500/20" },
  early: { label: "Early",     className: "bg-muted/40 text-muted-foreground/50 border border-muted/30" },
};

interface PatternBadgeProps {
  pattern: PatternType;
  score?: number | null;
  className?: string;
}

/**
 * Displays the price-structure pattern label with a colour-coded background.
 *
 * pattern = "A"            → green  "Pattern A"
 * pattern = "B"            → teal   "Pattern B"
 * pattern = "none", score > 0 → amber  "Choppy"
 * pattern = "none", score = 0 → red    "Drifting"
 * pattern = "early"        → muted  "Early"
 */
export function PatternBadge({ pattern, score, className }: PatternBadgeProps) {
  if (!pattern) return null;

  const key =
    pattern === "none" && score === 0 ? "drift" : pattern;

  const config = PATTERN_CONFIG[key];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
