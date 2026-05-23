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

/**
 * Top-of-page bot selector for /stats — mirrors freedombot.ai/performance
 * layout (logos + large labels) while keeping internal BotSourceFilter ids.
 */
export function StatsBotTabs({ value, onChange, className }: StatsBotTabsProps) {
  return (
    <div className={cn("w-full flex flex-col items-center gap-5 py-2", className)}>
      <p className="text-sm font-semibold text-muted-foreground/65 tracking-wide">
        Select bot to view performance
      </p>
      <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
        <div
          className="flex items-center gap-2 sm:gap-3 rounded-2xl p-2 sm:p-2.5 w-fit mx-auto min-w-0"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {BOT_SOURCE_PILLS.map((pill) => {
            const active = pill.id === value;
            const bot = pill.id === "ALL" ? null : BOT_META.get(pill.id);
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onChange(pill.id)}
                className={cn(
                  "relative flex items-center gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl font-bold transition-all whitespace-nowrap",
                  "text-sm sm:text-base",
                  active
                    ? "bg-accent/15 text-accent border border-accent/30 shadow-[0_0_20px_rgba(0,212,170,0.12)]"
                    : "text-muted-foreground/55 border border-transparent hover:text-foreground/80 hover:bg-white/[0.04]",
                )}
                aria-pressed={active}
              >
                {pill.id === "ALL" ? (
                  <span
                    className={cn(
                      "flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-accent/20" : "bg-white/[0.06]",
                    )}
                  >
                    <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                ) : bot?.logo ? (
                  <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-white/10 overflow-hidden">
                    <Image
                      src={bot.logo}
                      alt={pill.label}
                      width={28}
                      height={28}
                      className="object-contain rounded-full"
                    />
                  </span>
                ) : (
                  <span className="text-lg sm:text-xl leading-none shrink-0">
                    {bot?.icon ?? "₿"}
                  </span>
                )}
                <span>{pill.label}</span>
                {active && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
