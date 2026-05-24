"use client";

import { cn } from "@/lib/utils";
import type { MetricInsightDefinition, MetricStatus } from "@/lib/metric-insight-config";
import { STATUS_META, pillSolidBg } from "@/lib/metric-insight-config";

export interface MetricInsightCardProps {
  definition: MetricInsightDefinition;
  value: string;
  status: MetricStatus;
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

function valueGlowColor(status: MetricStatus, metricId: string): string {
  if (metricId === "drawdown") {
    return status === "weak" ? "#f87171" : "#fbbf24";
  }
  return STATUS_META[status].valueColor;
}

function valueTextShadow(color: string): string {
  return `0 0 16px ${color}44`;
}

function StatusPill({ status }: { status: MetricStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{ backgroundColor: pillSolidBg(status), color: "#ffffff" }}
    >
      {meta.label}
    </span>
  );
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

  if (compact) {
    return (
      <article
        className={cn(
          "flex flex-col justify-center rounded-lg px-3 py-2.5 min-h-0 flex-1",
          className,
        )}
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(90,140,220,0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3
            className="text-[10px] font-bold uppercase tracking-widest truncate"
            style={{ color: "#334155" }}
          >
            {definition.title}
          </h3>
          <StatusPill status={status} />
        </div>
        <p
          className="text-lg font-mono font-bold tabular-nums leading-none"
          style={{
            color: valueColor,
            textShadow: valueTextShadow(valueColor),
          }}
        >
          {value}
        </p>
        <p className="text-[10px] mt-1 truncate" style={{ color: "#475569" }}>
          {definition.helperLabel}
        </p>
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
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-white">{definition.title}</h3>
        <StatusPill status={status} />
      </div>
      <p
        className="text-2xl font-mono font-black tabular-nums leading-none mb-2"
        style={{ color: meta.valueColor, textShadow: valueTextShadow(meta.valueColor) }}
      >
        {value}
      </p>
      <p className="text-[11px]" style={{ color: "#94a3b8" }}>
        {definition.helperLabel}
      </p>
    </article>
  );
}
