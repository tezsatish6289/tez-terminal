"use client";

import { FNO_MUTED } from "@/lib/fnoninja/theme";
import {
  SR_REPLAY_SORT_OPTIONS,
  type SrReplaySort,
} from "@/lib/fnoninja/sr-replay-types";

export function FnoNinjaSrReplaySort({
  value,
  onChange,
  className = "",
}: {
  value: SrReplaySort;
  onChange: (sort: SrReplaySort) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 ${className}`.trim()}
      role="tablist"
      aria-label="Sort replays"
    >
      {SR_REPLAY_SORT_OPTIONS.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className="rounded-md px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors"
            style={{
              backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
              color: active ? "#bfdbfe" : FNO_MUTED,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
