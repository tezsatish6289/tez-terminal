"use client";

import { cn } from "@/lib/utils";
import {
  BOT_SOURCE_PILLS,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";

/**
 * BotSourceFilter — top-level pill row for filtering performance views
 * by trade origin (PATTERN / zone bots / ALL).
 *
 * Used by `/simulation`, `/freedombot/records`, and
 * `/freedombot/performance` to scope headline stats, equity curves, and
 * trade tables to a specific bot. Per-bot views are counterfactual:
 * they show what the equity would have been if only that bot ran,
 * starting from `simState.startingCapital`. The "All Bots" pill is the
 * actual shared-capital reality.
 *
 * Visually deliberately smaller than the asset-type pills so the user
 * reads the asset switch first and then refines by bot.
 */
export function BotSourceFilter({
  value,
  onChange,
  className,
  size = "md",
  /** When set, only these pills are shown (plus ALL if included in the list). */
  visibleIds,
}: {
  value:    BotSourceFilter;
  onChange: (v: BotSourceFilter) => void;
  className?: string;
  /** "sm" = compact for densely packed dashboards; "md" = default. */
  size?: "sm" | "md";
  visibleIds?: BotSourceFilter[];
}) {
  const pills = visibleIds
    ? BOT_SOURCE_PILLS.filter((p) => visibleIds.includes(p.id))
    : BOT_SOURCE_PILLS;

  return (
    <div className={cn(
      "inline-flex items-center gap-0 rounded-lg border border-white/[0.12] bg-[#0a0a0c] p-0.5 w-fit shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]",
      className,
    )}>
      {pills.map((pill) => {
        const active = pill.id === value;
        return (
          <button
            key={pill.id}
            type="button"
            onClick={() => onChange(pill.id)}
            className={cn(
              "rounded-md font-black uppercase tracking-wider transition-all",
              size === "sm"
                ? "px-2.5 py-1 text-[9px]"
                : "px-3 py-1.5 text-[10px]",
              active
                ? "bg-accent text-black shadow-[0_2px_10px_rgba(0,212,170,0.3)]"
                : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04]",
            )}
            aria-pressed={active}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
