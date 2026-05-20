"use client";

import { cn } from "@/lib/utils";

type SimTab = "overview" | "trades" | "logs";

export function SimulatorMainPanel({
  tab,
  onTabChange,
  openCount,
  logsCount,
  botFilterRow,
  filterHint,
  children,
}: {
  tab: SimTab;
  onTabChange: (t: SimTab) => void;
  openCount: number;
  logsCount: number;
  botFilterRow: React.ReactNode;
  filterHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tabs: { id: SimTab; label: string; count?: number }[] = [
    { id: "overview", label: "Open", count: openCount },
    { id: "trades", label: "History" },
    { id: "logs", label: "Logs", count: logsCount },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c0e]/80 overflow-hidden flex flex-col min-h-[320px]">
      {/* Panel header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 sm:px-4 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/40 border border-white/[0.06] w-fit">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={cn(
                    "relative px-3 sm:px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all",
                    active
                      ? "bg-accent text-black shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  {t.label}
                  {t.count != null && (
                    <span
                      className={cn(
                        "ml-1.5 tabular-nums",
                        active ? "text-black/50" : "text-muted-foreground/40",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {filterHint}
        </div>
        <div className="flex flex-wrap items-center gap-2">{botFilterRow}</div>
      </div>

      {/* Panel body */}
      <div className="flex-1 p-3 sm:p-4 min-h-0">{children}</div>
    </div>
  );
}
