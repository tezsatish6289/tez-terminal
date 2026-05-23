"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MetricInsightDefinition, MetricStatus } from "@/lib/metric-insight-config";
import { STATUS_META } from "@/lib/metric-insight-config";

export interface MetricInsightCardProps {
  definition: MetricInsightDefinition;
  value: string;
  status: MetricStatus;
  icon: React.ReactNode;
  className?: string;
}

export function MetricInsightCard({
  definition,
  value,
  status,
  icon,
  className,
}: MetricInsightCardProps) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status];
  const tooltipBody = `${definition.expandedExplanation}\n\nThink of it as: “${definition.thinkOfIt}”`;

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border p-4 sm:p-5 min-h-[168px]",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)]",
        "focus-within:ring-1 focus-within:ring-[rgba(96,165,250,0.35)]",
        className,
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
        borderColor: meta.border,
        boxShadow: status === "exceptional" ? meta.glow : undefined,
      }}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgba(96,165,250,0.08)",
              color: "#60a5fa",
            }}
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white leading-tight">
              {definition.title}
            </h3>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mt-1"
              style={{ color: "#475569" }}
            >
              {definition.helperLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
            style={{ backgroundColor: meta.badgeBg, color: meta.badgeText }}
          >
            {meta.label}
          </span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="hidden sm:flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
                  style={{ color: "#475569" }}
                  aria-label={`More about ${definition.title}`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="max-w-[260px] text-xs leading-relaxed p-3 border"
                style={{
                  backgroundColor: "#0a1628",
                  borderColor: "rgba(90,140,220,0.2)",
                  color: "#cbd5e1",
                }}
              >
                <p>{definition.expandedExplanation}</p>
                <p className="mt-2 italic" style={{ color: "#64748b" }}>
                  Think of it as: &ldquo;{definition.thinkOfIt}&rdquo;
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <p
        className="text-2xl sm:text-3xl font-mono font-black tabular-nums leading-none mb-2"
        style={{ color: meta.valueColor }}
      >
        {value}
      </p>

      <p
        className="text-[11px] sm:text-xs leading-relaxed mb-3"
        style={{ color: "#94a3b8" }}
      >
        {definition.shortInterpretation}
      </p>

      <Collapsible open={open} onOpenChange={setOpen} className="mt-auto">
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold py-2 rounded-md transition-colors hover:bg-white/[0.04]"
          style={{ color: "#60a5fa" }}
        >
          <span>{open ? "Hide details" : "Learn more"}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out">
          <div
            className="pt-3 pb-1 space-y-3 text-[11px] leading-relaxed border-t"
            style={{ borderColor: "rgba(90,140,220,0.1)", color: "#64748b" }}
          >
            <p style={{ color: "#94a3b8" }}>{definition.expandedExplanation}</p>
            <p>
              <span className="font-semibold" style={{ color: "#475569" }}>
                Think of it as:{" "}
              </span>
              &ldquo;{definition.thinkOfIt}&rdquo;
            </p>
            <p
              className="font-mono text-[10px] rounded-md px-2.5 py-2"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "#475569",
              }}
            >
              {definition.rangeGuide}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Screen-reader friendly full explanation (mobile uses collapsible) */}
      <span className="sr-only">{tooltipBody}</span>
    </article>
  );
}
