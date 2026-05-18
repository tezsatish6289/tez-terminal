"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hover info icon for admin CTAs and table headers. */
export function AdminInfoTip({
  text,
  className,
  iconClassName,
}: {
  text: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn("relative group inline-flex items-center cursor-help shrink-0", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Info
        className={cn(
          "h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors",
          iconClassName,
        )}
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-white/[0.10] bg-[#1a1a2e] px-3 py-2 text-[10px] leading-relaxed text-muted-foreground/90 shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 z-50"
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a2e]" />
      </span>
    </span>
  );
}

/** Label + optional info tip for table column headers. */
export function AdminColumnHeader({
  label,
  tip,
  className,
}: {
  label: string;
  tip?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {label}
      {tip ? <AdminInfoTip text={tip} /> : null}
    </span>
  );
}
