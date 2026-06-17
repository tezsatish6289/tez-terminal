"use client";

import { CalendarDays } from "lucide-react";
import type { PublicLevelsExpiryOption } from "@/lib/levels/index-expiry-levels";

export function LevelsChartExpiryPicker({
  options,
  value,
  onChange,
  className = "",
}: {
  options: PublicLevelsExpiryOption[];
  value: string | null;
  onChange: (expiryKey: string) => void;
  className?: string;
}) {
  if (options.length <= 1) return null;

  const selected = value ?? options[0]?.key ?? "";

  return (
    <label
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()}
      title="Option chain expiry used for support & resistance bands"
    >
      <CalendarDays className="h-3 w-3 shrink-0" style={{ color: "#64748b" }} aria-hidden />
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] shrink-0" style={{ color: "#64748b" }}>
        Expiry
      </span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-[9.5rem] truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/40"
        style={{
          color: "#e2e8f0",
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
        aria-label="Select option chain expiry"
      >
        {options.map((opt, i) => (
          <option key={opt.key} value={opt.key}>
            {i === 0 ? `${opt.label} (nearest)` : opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
