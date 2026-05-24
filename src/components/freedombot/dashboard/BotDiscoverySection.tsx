"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Rocket } from "lucide-react";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";
import type { CryptoBotId } from "@/lib/crypto-bots";
import { DashboardSectionHeader } from "@/components/freedombot/dashboard/DashboardSectionHeader";

interface CatalogBotStatRow {
  runningDays: number | null;
  totalReturnPct: number | null;
}

function fmtReturnPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtRunningDays(days: number | null | undefined, isPublished: boolean) {
  const resolved = days ?? (isPublished ? 1 : null);
  if (resolved == null) return "—";
  const n = Math.max(1, resolved);
  return `${n} ${n === 1 ? "Day" : "Days"}`;
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
  onDeploy: () => void;
  showHeading?: boolean;
  title?: string;
  description?: string;
}

type DiscoverMetric = {
  label: string;
  value: string;
  color: string;
};

function DiscoverBotCard({
  bot,
  isPublished,
  catalogStat,
  onDeploy,
}: {
  bot: PublicBotApiRow;
  isPublished: boolean;
  catalogStat: CatalogBotStatRow | null;
  onDeploy: () => void;
}) {
  const metrics: [DiscoverMetric, DiscoverMetric] = isPublished
    ? [
        {
          label: "Running",
          value: fmtRunningDays(catalogStat?.runningDays, true),
          color: "#f0f4ff",
        },
        {
          label: "Total Return",
          value: fmtReturnPct(catalogStat?.totalReturnPct),
          color: (catalogStat?.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171",
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

  return (
    <div
      className="rounded-2xl p-5 flex flex-col border border-dashed"
      style={{
        backgroundColor: "#080f1e",
        borderColor: isPublished ? "rgba(90,140,220,0.22)" : "rgba(90,140,220,0.12)",
        opacity: isPublished ? 1 : 0.72,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <BotIcon bot={bot} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">{bot.label}</p>
            {!isPublished && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "#fbbf24",
                    backgroundColor: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  Coming Soon
                </span>
              </div>
            )}
          </div>
        </div>
        {isPublished && (
          <button
            type="button"
            onClick={onDeploy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white transition-all hover:scale-105 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
          >
            <Rocket className="h-3 w-3" /> Deploy
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "#334155" }}
            >
              {m.label}
            </p>
            <p className="text-xl font-black truncate font-mono" style={{ color: m.color }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BotDiscoverySection({
  publicBots,
  onDeploy,
  showHeading = true,
  title = "More Bots",
  description = "Deploy additional bots to your exchange. Running time and returns reflect each bot's platform track record.",
}: BotDiscoverySectionProps) {
  const [catalogStats, setCatalogStats] = useState<Partial<Record<CryptoBotId, CatalogBotStatRow>>>(
    {},
  );

  useEffect(() => {
    fetch("/api/freedombot/catalog-bot-stats")
      .then((r) => r.json())
      .then((data: { stats?: Partial<Record<CryptoBotId, CatalogBotStatRow>> }) => {
        if (data.stats) setCatalogStats(data.stats);
      })
      .catch(() => {});
  }, []);

  return (
    <section>
      {showHeading && <DashboardSectionHeader title={title} description={description} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {publicBots.map((bot) => (
          <DiscoverBotCard
            key={bot.id}
            bot={bot}
            isPublished={bot.publicLive}
            catalogStat={catalogStats[bot.id] ?? null}
            onDeploy={onDeploy}
          />
        ))}
      </div>
    </section>
  );
}

