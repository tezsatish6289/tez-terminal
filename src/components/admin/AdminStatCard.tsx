"use client";

import { cn } from "@/lib/utils";

export function AdminStatCard({
  label,
  value,
  sublabel,
  active,
  onClick,
  valueClassName,
}: {
  label: string;
  value: string;
  sublabel?: string;
  active?: boolean;
  onClick?: () => void;
  valueClassName?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        "bg-gradient-to-b from-[#141416] to-[#0f0f11]",
        onClick && "hover:border-accent/30 cursor-pointer",
        active ? "border-accent/40 ring-1 ring-accent/20" : "border-white/[0.06]",
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
        {label}
      </span>
      <span
        className={cn(
          "text-2xl font-black font-mono block mt-1",
          valueClassName ?? "text-white",
        )}
      >
        {value}
      </span>
      {sublabel ? (
        <span className="text-[10px] text-muted-foreground/60 block mt-1">{sublabel}</span>
      ) : null}
    </Comp>
  );
}

export function formatUsdtHeadline(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
