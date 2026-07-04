"use client";

import { CalendarDays } from "lucide-react";
import type { PublicLevelsExpiryOption } from "@/lib/levels/index-expiry-levels";

const AMBER = {
  label: "#fbbf24",
  icon: "#f59e0b",
  text: "#fef3c7",
  border: "rgba(251, 191, 36, 0.55)",
  bg: "rgba(120, 53, 15, 0.45)",
  focusRing: "rgba(251, 191, 36, 0.5)",
} as const;

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
      <CalendarDays className="h-3.5 w-3.5 shrink-0" style={{ color: AMBER.icon }} aria-hidden />
      <span
        className="text-[9px] font-bold uppercase tracking-[0.1em] shrink-0"
        style={{ color: AMBER.label }}
      >
        Expiry
      </span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-[10rem] truncate rounded-full border px-2.5 py-1 text-[10px] font-bold cursor-pointer focus:outline-none focus:ring-2"
        style={{
          color: AMBER.text,
          backgroundColor: AMBER.bg,
          borderColor: AMBER.border,
          boxShadow: "0 0 0 1px rgba(251, 191, 36, 0.12), inset 0 1px 0 rgba(251, 191, 36, 0.08)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 2px ${AMBER.focusRing}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 0 1px rgba(251, 191, 36, 0.12), inset 0 1px 0 rgba(251, 191, 36, 0.08)";
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
