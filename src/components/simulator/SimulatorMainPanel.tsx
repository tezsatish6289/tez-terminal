"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type SimTab = "overview" | "trades" | "logs";

/**
 * Right rail of the cockpit — Open / History / Logs tabs beside the zone chart.
 */
export function SimulatorMainPanel({
  tab,
  onTabChange,
  openCount,
  closedCount,
  logsCount,
  showAllBots,
  onShowAllBotsChange,
  children,
}: {
  tab: SimTab;
  onTabChange: (t: SimTab) => void;
  openCount: number;
  /** Total closed trades for the selected bot — surfaced as the
   *  HISTORY tab badge so users can see the lifetime count without a
   *  separate stat tile on the detail card. */
  closedCount: number;
  logsCount: number;
  showAllBots?: boolean;
  onShowAllBotsChange?: (value: boolean) => void;
  children: React.ReactNode;
}) {
  const tabs: { id: SimTab; label: string; count?: number }[] = [
    { id: "overview", label: "Open", count: openCount },
    { id: "trades", label: "History", count: closedCount },
    { id: "logs", label: "Logs", count: logsCount },
  ];

  const showAllBotsToggle =
    tab === "overview" && onShowAllBotsChange != null;

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="shrink-0 px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2 border-b border-white/[0.08] min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0a0a0c] border border-white/[0.1] shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] shrink-0">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={cn(
                    "relative px-2.5 sm:px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                    active
                      ? "bg-accent text-black shadow-[0_2px_10px_rgba(0,212,170,0.3)]"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  {t.label}
                  {t.count != null && (
                    <span
                      className={cn(
                        "ml-1 tabular-nums",
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
          {showAllBotsToggle ? (
            <div
              className="flex items-center gap-2 shrink-0 pl-2 border-l border-white/[0.08]"
              title={
                showAllBots
                  ? `Showing ${openCount} open trade${openCount === 1 ? "" : "s"} across every bot`
                  : "Only the selected bot — turn on to see every open position"
              }
            >
              <span className="text-[9px] font-black uppercase tracking-wider text-foreground/80 whitespace-nowrap">
                All bots
              </span>
              <Switch
                checked={showAllBots ?? false}
                onCheckedChange={onShowAllBotsChange}
                aria-label="Show open trades from all bots"
              />
            </div>
          ) : null}
        </div>
        <Link
          href="/stats"
          className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/45 hover:text-accent transition-colors shrink-0"
        >
          Stats →
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-3 py-2.5 sm:py-3">
        {children}
      </div>
    </div>
  );
}
