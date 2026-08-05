"use client";

import type { ReactNode } from "react";
import { trackCtaClick } from "@/firebase/analytics";

export type LevelsViewMode = "chart" | "outlook" | "history" | "pvt";

const CHART_VIEW_CTA_ID: Record<LevelsViewMode, string> = {
  pvt: "chart_view_pvt",
  chart: "chart_view_intraday",
  outlook: "chart_view_outlook",
  history: "chart_view_history",
};

export function LevelsOutlookViewToggle({
  value,
  onChange,
  trailing,
}: {
  value: LevelsViewMode;
  onChange: (v: LevelsViewMode) => void;
  /** Expiry picker etc. — own row on mobile, right-aligned beside tabs on md+. */
  trailing?: ReactNode;
}) {
  const options: { id: LevelsViewMode; label: string; kbd?: string }[] = [
    { id: "pvt", label: "Trend Chart", kbd: "P" },
    { id: "chart", label: "Intraday Chart", kbd: "C" },
    { id: "outlook", label: "Outlook", kbd: "O" },
    { id: "history", label: "History", kbd: "H" },
  ];
  return (
    <div className="mb-1.5 flex shrink-0 flex-col gap-1.5 w-full min-w-0 md:flex-row md:items-center md:justify-between md:gap-2">
      <div className="min-w-0 w-full overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-auto md:overflow-visible">
        <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 w-max max-w-none">
          {options.map((o) => {
            const active = value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  trackCtaClick(CHART_VIEW_CTA_ID[o.id], { label: o.label, view: o.id });
                  onChange(o.id);
                }}
                title={o.kbd ? `${o.label} (${o.kbd})` : o.label}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 sm:px-3 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
                  color: active ? "#bfdbfe" : "#94a3b8",
                }}
              >
                {o.label}
                {o.kbd ? (
                  <kbd
                    className="hidden sm:inline rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide"
                    style={{
                      color: active ? "#93c5fd" : "#64748b",
                      backgroundColor: "rgba(15,23,42,0.5)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {o.kbd}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {trailing ? <div className="shrink-0 w-full md:w-auto md:ml-auto">{trailing}</div> : null}
    </div>
  );
}
