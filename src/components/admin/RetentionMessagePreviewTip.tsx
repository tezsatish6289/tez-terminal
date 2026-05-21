"use client";

import { cn } from "@/lib/utils";

/** Wide hover panel for full retention modal copy (admin bot-users). */
export function RetentionMessagePreviewTip({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative group inline-flex flex-col items-end cursor-help max-w-full",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-[min(22rem,calc(100vw-2rem))] max-h-72 overflow-y-auto rounded-lg border border-white/[0.10] bg-[#0a1628] px-3 py-2.5 text-[10px] leading-relaxed text-slate-300 shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 z-[80] whitespace-pre-wrap text-left font-normal normal-case tracking-normal"
      >
        {text}
        <span className="absolute top-full right-4 border-4 border-transparent border-t-[#0a1628]" />
      </span>
    </span>
  );
}
