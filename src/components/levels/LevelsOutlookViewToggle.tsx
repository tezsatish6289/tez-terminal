"use client";

export function LevelsOutlookViewToggle({
  value,
  onChange,
}: {
  value: "chart" | "outlook";
  onChange: (v: "chart" | "outlook") => void;
}) {
  const options: { id: "chart" | "outlook"; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "outlook", label: "Outlook" },
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
            className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
              color: active ? "#bfdbfe" : "#94a3b8",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
