"use client";

import Image from "next/image";
import { Rocket } from "lucide-react";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";

interface BotStats {
  runningDays: number;
  currentCapital?: number;
  startingCapital?: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  isAnnualizationReliable?: boolean;
}

function fmt(n: number | null | undefined, suffix = "%") {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

export function BotIcon({ bot, size = 28 }: { bot: PublicBotApiRow; size?: number }) {
  if (bot.logo) {
    return (
      <Image
        src={bot.logo}
        alt={bot.label}
        width={size}
        height={size}
        className="rounded-full object-contain"
      />
    );
  }
  return (
    <span
      className="font-black"
      style={{ fontSize: size === 28 ? "1.5rem" : `${size * 0.6}px`, lineHeight: 1 }}
    >
      {bot.icon}
    </span>
  );
}

interface BotDiscoverySectionProps {
  publicBots: PublicBotApiRow[];
  stats: BotStats | null;
  onDeploy: () => void;
  showHeading?: boolean;
}

export function BotDiscoverySection({
  publicBots,
  stats,
  onDeploy,
  showHeading = true,
}: BotDiscoverySectionProps) {
  const liveBots = publicBots.filter((b) => b.publicLive);
  const comingSoonBots = publicBots.filter((b) => !b.publicLive);

  return (
    <section>
      {showHeading && (
        <h2 className="text-lg font-black text-white mb-4">Discover bots</h2>
      )}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(90,140,220,0.15)" }}
      >
        {liveBots.map((bot) => {
          const hasStats = bot.id === "crypto";
          return (
            <div key={bot.id} style={{ borderBottom: "1px solid rgba(90,140,220,0.1)" }}>
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{
                  background: "linear-gradient(90deg, rgba(37,99,235,0.08), transparent)",
                  borderBottom: "1px solid rgba(90,140,220,0.08)",
                }}
              >
                <div className="flex items-center gap-3">
                  <BotIcon bot={bot} size={28} />
                  <div>
                    <p className="text-sm font-black text-white">{bot.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className="h-1.5 w-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: "#22c55e" }}
                      />
                      <span className="text-[10px] font-bold" style={{ color: "#22c55e" }}>
                        Live{hasStats && stats ? ` · ${stats.runningDays} days` : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDeploy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
                  style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
                >
                  <Rocket className="h-3.5 w-3.5" /> Deploy
                </button>
              </div>
              {hasStats && (
                <div
                  className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y"
                  style={{ backgroundColor: "#060d1a", borderColor: "rgba(90,140,220,0.06)" }}
                >
                  {[
                    { label: "Running", value: stats ? `${stats.runningDays} Days` : "…", color: "#f0f4ff" },
                    {
                      label: "Start Capital",
                      value: stats?.startingCapital
                        ? `$${stats.startingCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "…",
                      color: "#f0f4ff",
                    },
                    {
                      label: "Current Capital",
                      value: stats?.currentCapital
                        ? `$${stats.currentCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "…",
                      color: "#60a5fa",
                    },
                    {
                      label: "Total Return",
                      value: stats ? fmt(stats.totalReturnPct) : "…",
                      color: (stats?.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171",
                    },
                    {
                      label: "Monthly Return",
                      value: stats ? fmt(stats.profitPerMonth) : "…",
                      color: "#60a5fa",
                      projected: stats ? stats.runningDays < 30 : false,
                    },
                    {
                      label: "Annualized Return",
                      value: stats ? fmt(stats.profitPerYear) : "…",
                      color: "#a78bfa",
                      projected: stats ? stats.runningDays < 365 : false,
                      warn: stats ? stats.isAnnualizationReliable === false || stats.runningDays < 7 : false,
                    },
                  ].map((s) => (
                    <div key={s.label} className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-0.5 flex-wrap">
                        <p className="text-base font-black" style={{ color: s.color }}>
                          {s.value}
                        </p>
                        {"projected" in s && s.projected && (
                          <span
                            className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
                          >
                            Proj.
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "#334155" }}
                      >
                        {s.label}
                      </p>
                      {"warn" in s && s.warn && (
                        <p
                          className="text-[9px] font-semibold mt-1 leading-snug"
                          style={{ color: "#fbbf24" }}
                          title="Annualised metrics are statistically noisy under a week of live trading"
                        >
                          Short track record — may be volatile
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {comingSoonBots.map((bot, i) => (
          <div
            key={bot.id}
            className="flex items-center justify-between px-5 py-4"
            style={{
              backgroundColor: "#060d1a",
              borderBottom: i < comingSoonBots.length - 1 ? "1px solid rgba(90,140,220,0.06)" : "none",
              opacity: 0.6,
            }}
          >
            <div className="flex items-center gap-3">
              <BotIcon bot={bot} size={28} />
              <div>
                <p className="text-sm font-black text-white">{bot.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
                  {bot.shortLabel} perpetuals · live launch soon
                </p>
              </div>
            </div>
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider"
              style={{
                backgroundColor: "rgba(251,191,36,0.12)",
                color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.25)",
              }}
            >
              Coming Soon
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
