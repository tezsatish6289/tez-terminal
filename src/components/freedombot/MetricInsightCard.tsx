"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** @deprecated Icons omitted in compact sidebar layout */
  icon?: React.ReactNode;
  className?: string;
  /** Sidebar stack next to chart — matches original performance layout */
  compact?: boolean;
}

function valueGlowColor(status: MetricStatus, metricId: string): string {
  if (metricId === "drawdown") {
    return status === "weak" ? "#f87171" : "#fbbf24";
  }
  const c = STATUS_META[status].valueColor;
  return c;
}

function valueTextShadow(color: string): string {
  return `0 0 24px ${color}55, 0 0 48px ${color}22`;
}

export function MetricInsightCard({
  definition,
  value,
  status,
  className,
  compact = false,
}: MetricInsightCardProps) {
  const meta = STATUS_META[status];
  const valueColor = valueGlowColor(status, definition.id);
  const pillSolidBg =
    status === "healthy" && definition.id === "drawdown"
      ? "#d97706"
      : status === "weak"
        ? "#dc2626"
        : status === "healthy"
          ? "#ca8a04"
          : status === "strong" || status === "exceptional"
            ? "#16a34a"
            : "#ca8a04";

  if (compact) {
    return (
      <article
        className={cn(
          "group relative flex flex-col rounded-lg px-4 py-3.5 min-h-[108px]",
          "transition-all duration-200 hover:brightness-[1.03]",
          className,
        )}
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(90,140,220,0.08)",
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "#334155" }}
          >
            {definition.title}
          </h3>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 flex items-center justify-center rounded"
                  style={{ color: "#475569" }}
                  aria-label={`About ${definition.title}`}
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="max-w-[240px] text-xs leading-relaxed p-3 border"
                style={{
                  backgroundColor: "#0a1628",
                  borderColor: "rgba(90,140,220,0.2)",
                  color: "#cbd5e1",
                }}
              >
                <p>{definition.shortInterpretation}</p>
                <p className="mt-2" style={{ color: "#64748b" }}>
                  {definition.thinkOfIt}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <p
          className="text-xl font-mono font-bold tabular-nums leading-none mb-2"
          style={{
            color: valueColor,
            textShadow: valueTextShadow(valueColor),
          }}
        >
          {value}
        </p>

        <p
          className="text-[10px] font-medium mb-3"
          style={{ color: "#475569" }}
        >
          {definition.helperLabel}
        </p>

        <div className="mt-auto">
          <span
            className="block w-full text-center text-[9px] font-black uppercase tracking-widest py-1.5 rounded-md"
            style={{
              backgroundColor: pillSolidBg,
              color: "#ffffff",
            }}
          >
            {meta.label.toUpperCase()}
          </span>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border p-4 sm:p-5 min-h-[168px]",
        "transition-all duration-200 ease-out hover:-translate-y-0.5",
        className,
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
        borderColor: meta.border,
        boxShadow: status === "exceptional" ? meta.glow : undefined,
      }}
    >
      <h3 className="text-sm font-bold text-white mb-2">{definition.title}</h3>
      <p
        className="text-2xl font-mono font-black tabular-nums leading-none mb-2"
        style={{ color: meta.valueColor, textShadow: valueTextShadow(meta.valueColor) }}
      >
        {value}
      </p>
      <p className="text-[11px] mb-3" style={{ color: "#94a3b8" }}>
        {definition.helperLabel}
      </p>
      <span
        className="mt-auto block text-center text-[9px] font-black uppercase tracking-widest py-1.5 rounded-md"
        style={{ backgroundColor: pillSolidBg, color: "#fff" }}
      >
        {meta.label.toUpperCase()}
      </span>
    </article>
  );
}
