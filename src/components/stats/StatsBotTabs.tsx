"use client";

import Image from "next/image";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOT_SOURCE_PILLS,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";

const BOT_META = new Map(
  CRYPTO_BOTS.map((b) => [b.botSource, b] as const),
);

interface StatsBotTabsProps {
  value: BotSourceFilter;
  onChange: (v: BotSourceFilter) => void;
  className?: string;
}

/** Bot selector for /stats — same simple tab row as freedombot performance. */
export function StatsBotTabs({ value, onChange, className }: StatsBotTabsProps) {
  return (
    <div className={cn("w-full overflow-x-auto pb-1", className)}>
      <div className="flex items-center gap-1.5 sm:gap-2 rounded-xl p-1 w-fit mx-auto min-w-0 border border-white/[0.08] bg-white/[0.03]">
        {BOT_SOURCE_PILLS.map((pill) => {
          const active = pill.id === value;
          const bot = pill.id === "ALL" ? null : BOT_META.get(pill.id);
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => onChange(pill.id)}
              className={cn(
                "relative flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-bold transition-all whitespace-nowrap text-xs sm:text-sm",
                active
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-muted-foreground/55 border border-transparent hover:text-foreground/80 hover:bg-white/[0.04]",
              )}
              aria-pressed={active}
            >
              {pill.id === "ALL" ? (
                <span
                  className={cn(
                    "flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-accent/20" : "bg-white/[0.06]",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
              ) : bot?.logo ? (
                <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-white/10 overflow-hidden">
                  <Image
                    src={bot.logo}
                    alt={pill.label}
                    width={22}
                    height={22}
                    className="object-contain rounded-full"
                  />
                </span>
              ) : (
                <span className="text-base leading-none shrink-0">
                  {bot?.icon ?? "₿"}
                </span>
              )}
              <span>{pill.label}</span>
              {active && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
