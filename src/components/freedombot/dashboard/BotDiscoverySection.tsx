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

type DiscoverMetric = {
  label: string;
  value: string;
  color: string;
};

function DiscoverBotCard({
  bot,
  isLive,
  stats,
  onDeploy,
}: {
  bot: PublicBotApiRow;
  isLive: boolean;
  stats: BotStats | null;
  onDeploy: () => void;
}) {
  const hasPlatformStats = isLive && bot.id === "crypto" && stats;

  const metrics: [DiscoverMetric, DiscoverMetric] = hasPlatformStats
    ? [
        {
          label: "Running",
          value: `${stats.runningDays} ${stats.runningDays === 1 ? "Day" : "Days"}`,
          color: "#f0f4ff",
        },
        {
          label: "Total Return",
          value: fmt(stats.totalReturnPct),
          color: (stats.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171",
        },
      ]
    : isLive
      ? [
          {
            label: "Markets",
            value: `${bot.shortLabel} perpetuals`,
            color: "#94a3b8",
          },
          {
            label: "Status",
            value: "Available",
            color: "#60a5fa",
          },
        ]
      : [
          {
            label: "Markets",
            value: `${bot.shortLabel} perpetuals`,
            color: "#64748b",
          },
          {
            label: "Launch",
            value: "Soon",
            color: "#fbbf24",
          },
        ];

  const statusMeta = isLive
    ? {
        label: "Live",
        color: "#22c55e",
        bg: "rgba(34,197,94,0.1)",
        border: "rgba(34,197,94,0.25)",
        pulse: true,
      }
    : {
        label: "Coming Soon",
        color: "#fbbf24",
        bg: "rgba(251,191,36,0.12)",
        border: "rgba(251,191,36,0.25)",
        pulse: false,
      };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        backgroundColor: "#0a1628",
        border: `1px solid ${isLive ? "rgba(90,140,220,0.15)" : "rgba(90,140,220,0.12)"}`,
        opacity: isLive ? 1 : 0.72,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <BotIcon bot={bot} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">{bot.label}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {statusMeta.pulse && (
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: statusMeta.color }}
                />
              )}
              <span
                className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: statusMeta.color,
                  backgroundColor: statusMeta.bg,
                  border: `1px solid ${statusMeta.border}`,
                }}
              >
                {statusMeta.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "#334155" }}
            >
              {m.label}
            </p>
            <p className="text-xl font-black truncate" style={{ color: m.color }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {isLive ? (
        <button
          type="button"
          onClick={onDeploy}
          className="mt-auto flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-[1.02]"
          style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
        >
          <Rocket className="h-3.5 w-3.5" /> Deploy
        </button>
      ) : (
        <div className="mt-auto h-[42px]" aria-hidden />
      )}
    </div>
  );
}

export function BotDiscoverySection({
  publicBots,
  stats,
  onDeploy,
  showHeading = true,
}: BotDiscoverySectionProps) {
  return (
    <section>
      {showHeading && (
        <h2 className="text-lg font-black text-white mb-4">Discover bots</h2>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {publicBots.map((bot) => (
          <DiscoverBotCard
            key={bot.id}
            bot={bot}
            isLive={bot.publicLive}
            stats={stats}
            onDeploy={onDeploy}
          />
        ))}
      </div>
    </section>
  );
}
