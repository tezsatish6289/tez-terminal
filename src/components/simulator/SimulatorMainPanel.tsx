"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type SimTab = "overview" | "trades" | "logs";

/**
 * Bottom section of the cockpit — Open / History / Logs tabs.
 *
 * Renders without its own outer panel so it can be folded into the
 * selected bot's HeatmapAssetCard footer slot. The card above already
 * shows the bot label + mode buttons, and the left rail handles bot
 * switching, so we drop both the duplicate title and the
 * "Select another card" hint that used to live here.
 */
export function SimulatorMainPanel({
  tab,
  onTabChange,
  openCount,
  closedCount,
  logsCount,
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
  children: React.ReactNode;
}) {
  const tabs: { id: SimTab; label: string; count?: number }[] = [
    { id: "overview", label: "Open", count: openCount },
    { id: "trades", label: "History", count: closedCount },
    { id: "logs", label: "Logs", count: logsCount },
  ];

  return (
    <div className="flex flex-col">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0a0a0c] border border-white/[0.1] shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={cn(
                  "relative px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all",
                  active
                    ? "bg-accent text-black shadow-[0_2px_10px_rgba(0,212,170,0.3)]"
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
        <Link
          href="/stats"
          className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/45 hover:text-accent transition-colors shrink-0"
        >
          Performance &amp; stats →
        </Link>
      </div>
      <div className="flex-1 px-3 sm:px-4 pb-3 sm:pb-4 min-h-0">{children}</div>
    </div>
  );
}
