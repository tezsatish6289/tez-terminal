"use client";

import type { ReactNode } from "react";

export type LevelsViewMode = "chart" | "outlook" | "history" | "pvt";

export function LevelsOutlookViewToggle({
  value,
  onChange,
  trailing,
}: {
  value: LevelsViewMode;
  onChange: (v: LevelsViewMode) => void;
  /** Right side of tab row (e.g. expiry picker on chart tabs). */
  trailing?: ReactNode;
}) {
  const options: { id: LevelsViewMode; label: string; kbd?: string }[] = [
    { id: "pvt", label: "Trend Chart", kbd: "P" },
    { id: "chart", label: "Intraday Chart", kbd: "C" },
    { id: "outlook", label: "Outlook", kbd: "O" },
    { id: "history", label: "History", kbd: "H" },
  ];
  return (
    <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 w-full min-w-0">
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              title={o.kbd ? `${o.label} (${o.kbd})` : o.label}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-colors"
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
      {trailing ? <div className="shrink-0 ml-auto">{trailing}</div> : null}
    </div>
  );
}
