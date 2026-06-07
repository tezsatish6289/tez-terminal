"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  deriveCockpitCardStatus,
  type CockpitCardStatus,
} from "@/lib/cockpit-card-status";
import { formatSpot, type SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS } from "@/components/levels/levels-symbol-strip";
import type { ZoneBotDirection } from "@/lib/zone-bot-state";

const BOT_META = new Map(CRYPTO_BOTS.map((b) => [b.id, b] as const));

const POWER_DOT: Record<CockpitCardStatus["power"], string> = {
  on: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
  idle: "bg-amber-300/90 shadow-[0_0_6px_rgba(252,211,77,0.45)]",
  off: "bg-rose-400/90 shadow-[0_0_6px_rgba(251,113,133,0.45)]",
};

export interface SimBotStripItem {
  id: CockpitBotId;
  label: string;
  shortLabel: string;
  suggested: SuggestedZonesSnapshot | null;
  liveSpot: number | null;
  manualOverride: string | null;
  engineReason: string | null;
  engineDirection: ZoneBotDirection | null;
  simEnabled?: boolean | null;
  botEngineLive: boolean;
  liveCount: number;
}

export function SimBotStrip({
  items,
  selectedId,
  onSelect,
  className,
}: {
  items: SimBotStripItem[];
  selectedId: CockpitBotId;
  onSelect: (id: CockpitBotId) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const tile = container?.querySelector(
      `[data-sim-bot="${selectedId}"]`,
    ) as HTMLElement | null;
    tile?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  return (
    <div
      className={cn(
        "relative flex-1 min-w-0 min-h-0",
        LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS,
        className,
      )}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10"
        style={{
          background:
            "linear-gradient(to right, #08080a 0%, #08080a 40%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10"
        style={{
          background:
            "linear-gradient(to left, #08080a 0%, #08080a 40%, transparent 100%)",
        }}
      />
      <div
        ref={scrollRef}
        className="h-full overflow-x-auto overflow-y-hidden flex flex-row gap-1.5 pr-0.5 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((bot) => {
          const active = bot.id === selectedId;
          const meta = BOT_META.get(bot.id);
          const status = deriveCockpitCardStatus({
            botId: bot.id,
            suggested: bot.suggested,
            manualOverride: bot.manualOverride,
            engineReason: bot.engineReason,
            engineDirection: bot.engineDirection,
            simEnabled: bot.simEnabled,
            botEngineLive: bot.botEngineLive,
            liveCount: bot.liveCount,
          });
          const spot = bot.liveSpot;

          return (
            <button
              key={bot.id}
              type="button"
              data-sim-bot={bot.id}
              onClick={() => onSelect(bot.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-col justify-center gap-1 px-3 py-2 rounded-lg text-left shrink-0 h-full",
                "min-w-[9.5rem] max-w-[11rem] snap-center transition-all duration-300",
                active
                  ? "bg-blue-500/[0.18] border border-blue-500/35 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
                  : "bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0 w-full">
                <span
                  className={cn(
                    "shrink-0 inline-block w-1.5 h-1.5 rounded-full",
                    POWER_DOT[status.power],
                  )}
                  aria-hidden
                />
                {meta?.logo ? (
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 overflow-hidden",
                      !active && "opacity-55 grayscale",
                    )}
                  >
                    <Image
                      src={meta.logo}
                      alt={bot.label}
                      width={18}
                      height={18}
                      className="object-contain rounded-full"
                    />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-sm leading-none shrink-0",
                      !active && "opacity-55",
                    )}
                  >
                    {meta?.icon ?? "₿"}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[12px] font-bold leading-tight truncate flex-1",
                    active ? "text-blue-200" : "text-foreground/85",
                  )}
                >
                  {bot.shortLabel}
                </span>
                {bot.liveCount > 0 && (
                  <span className="shrink-0 text-[8px] font-black tabular-nums px-1 py-0.5 rounded bg-accent/15 text-accent border border-accent/25">
                    {bot.liveCount}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
                  ${formatSpot(spot)}
                </span>
                <span
                  className={cn(
                    "text-[8px] font-bold uppercase tracking-wider truncate max-w-[4.5rem]",
                    status.power === "on"
                      ? "text-emerald-400/80"
                      : status.power === "idle"
                        ? "text-amber-300/70"
                        : "text-muted-foreground/40",
                  )}
                >
                  {status.bucketLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
