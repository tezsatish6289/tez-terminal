"use client";

import Image from "next/image";
import type { CryptoBotId } from "@/lib/crypto-bots";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";

/** Bot selector for freedombot.ai — one row, crypto asset implied. */
export function PublicBotTabs({
  bots,
  selectedId,
  onSelect,
  variant = "performance",
}: {
  bots: PublicBotApiRow[];
  selectedId: CryptoBotId;
  onSelect: (id: CryptoBotId) => void;
  variant?: "performance" | "records";
}) {
  if (variant === "performance") {
    return (
      <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
        <div
          className="flex items-center gap-2 sm:gap-3 rounded-2xl p-2 sm:p-2.5 w-fit mx-auto"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(90,140,220,0.1)",
          }}
        >
          {bots.map((bot) => {
            const isActive = selectedId === bot.id;
            const canSelect = bot.publicLive;
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => canSelect && onSelect(bot.id)}
                disabled={!canSelect}
                className="relative flex items-center gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl text-sm sm:text-base font-bold transition-all whitespace-nowrap"
                style={
                  isActive
                    ? {
                        backgroundColor: "rgba(96,165,250,0.15)",
                        color: "#60a5fa",
                        border: "1px solid rgba(96,165,250,0.25)",
                      }
                    : {
                        color: "#475569",
                        border: "1px solid transparent",
                        cursor: canSelect ? "pointer" : "default",
                      }
                }
              >
                {bot.logo ? (
                  <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <Image
                      src={bot.logo}
                      alt={bot.shortLabel}
                      width={28}
                      height={28}
                      className="object-contain rounded-full"
                    />
                  </div>
                ) : (
                  <span className="text-lg sm:text-xl leading-none">{bot.icon}</span>
                )}
                <span>{bot.label}</span>
                {bot.publicLive && isActive && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                )}
                {!bot.publicLive && (
                  <span
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ml-0.5"
                    style={{
                      backgroundColor: "rgba(96,165,250,0.08)",
                      color: "#334155",
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const CARD_BG = "#0a1628";
  const CARD_BORDER = "rgba(90,140,220,0.18)";

  return (
    <div className="flex items-end gap-0 overflow-x-auto">
      {bots.map((bot) => {
        const isActive = selectedId === bot.id;
        return (
          <button
            key={bot.id}
            type="button"
            onClick={() => onSelect(bot.id)}
            className="flex items-center gap-2 px-5 py-3 text-sm font-bold whitespace-nowrap transition-all relative flex-shrink-0"
            style={{
              backgroundColor: isActive ? CARD_BG : "transparent",
              color: isActive ? "#f0f4ff" : "#334155",
              borderTop: `2px solid ${isActive ? (bot.publicLive ? "#22c55e" : CARD_BORDER) : "transparent"}`,
              borderLeft: `1px solid ${isActive ? CARD_BORDER : "transparent"}`,
              borderRight: `1px solid ${isActive ? CARD_BORDER : "transparent"}`,
              borderBottom: `1px solid ${isActive ? CARD_BG : "transparent"}`,
              borderRadius: "10px 10px 0 0",
              marginBottom: isActive ? "-1px" : "0",
              zIndex: isActive ? 1 : 0,
            }}
          >
            {bot.logo ? (
              <div className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                <Image
                  src={bot.logo}
                  alt={bot.shortLabel}
                  width={18}
                  height={18}
                  className="object-contain rounded-full"
                />
              </div>
            ) : (
              <span className="text-base">{bot.icon}</span>
            )}
            <span>{bot.label}</span>
            {bot.publicLive ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: "#22c55e" }}
                />
              </span>
            ) : (
              <span
                className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{
                  backgroundColor: "rgba(251,191,36,0.1)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
