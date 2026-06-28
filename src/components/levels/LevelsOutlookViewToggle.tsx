"use client";

export type LevelsViewMode = "chart" | "outlook" | "history";

export function LevelsOutlookViewToggle({
  value,
  onChange,
}: {
  value: LevelsViewMode;
  onChange: (v: LevelsViewMode) => void;
}) {
  const options: { id: LevelsViewMode; label: string; kbd?: string }[] = [
    { id: "chart", label: "Chart", kbd: "C" },
    { id: "outlook", label: "Outlook", kbd: "O" },
    { id: "history", label: "History", kbd: "H" },
  ];
  return (
    <div className="mb-1.5 flex shrink-0 items-center gap-1 self-start rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
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
  );
}
