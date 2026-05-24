"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import { freedombotBotDetailPath } from "@/lib/freedombot/dashboard-path";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";
import { BotIcon } from "@/components/freedombot/dashboard/BotDiscoverySection";

export interface DashboardDeployment {
  id: string;
  bot: string;
  exchange: string;
  status: "active" | "paused";
  createdAt: string | null;
  lifetimeRealizedPnl?: number;
  wallet?: {
    status: "valid" | "invalid";
  } | null;
}

type DisplayStatus = "live" | "paused" | "disconnected";

function botLabel(deployKey: string, publicBots: PublicBotApiRow[]): string {
  const fromRegistry = publicBots.find((b) => b.deployKey === deployKey);
  if (fromRegistry) return fromRegistry.label;
  const fromCatalog = CRYPTO_BOTS.find((b) => b.deployKey === deployKey);
  return fromCatalog?.label ?? deployKey;
}

function runningDays(createdAt: string | null): number {
  if (!createdAt) return 1;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

function displayStatus(d: DashboardDeployment): DisplayStatus {
  if (d.wallet?.status === "invalid") return "disconnected";
  if (d.status === "paused") return "paused";
  return "live";
}

/** Active → paused → disconnected; newest first within each tier. */
export function sortDeployments(deployments: DashboardDeployment[]): DashboardDeployment[] {
  const tier = (d: DashboardDeployment) => {
    const s = displayStatus(d);
    if (s === "live") return 0;
    if (s === "paused") return 1;
    return 2;
  };
  return [...deployments].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    const aMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bMs - aMs;
  });
}

const STATUS_META: Record<
  DisplayStatus,
  { label: string; color: string; bg: string; border: string; pulse?: boolean }
> = {
  live: {
    label: "Live",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.25)",
    pulse: true,
  },
  paused: {
    label: "Paused",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.25)",
  },
  disconnected: {
    label: "Disconnected",
    color: "#f87171",
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.25)",
  },
};

interface RunningBotCardsProps {
  deployments: DashboardDeployment[];
  publicBots: PublicBotApiRow[];
}

export function RunningBotCards({ deployments, publicBots }: RunningBotCardsProps) {
  const pathname = usePathname();
  const sorted = sortDeployments(deployments);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((dep) => {
        const bot = publicBots.find((b) => b.deployKey === dep.bot) ?? {
          id: "crypto" as const,
          label: botLabel(dep.bot, publicBots),
          shortLabel: dep.bot,
          deployKey: dep.bot,
          botSource: "",
          icon: "₿",
          logo: null,
          publicLive: true,
        };
        const status = displayStatus(dep);
        const meta = STATUS_META[status];
        const days = runningDays(dep.createdAt);
        const pnl = dep.lifetimeRealizedPnl ?? 0;
        const pnlPositive = pnl >= 0;
        const href = freedombotBotDetailPath(pathname, dep.id);
        const title = `${botLabel(dep.bot, publicBots)} × ${exchangeLabel(dep.exchange)}`;

        return (
          <Link
            key={dep.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl p-5 transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: "#0c1a30",
              border: `1px solid ${status === "disconnected" ? "rgba(248,113,113,0.35)" : "rgba(59,130,246,0.35)"}`,
              boxShadow:
                status === "disconnected"
                  ? "none"
                  : "0 0 0 1px rgba(59,130,246,0.08), 0 8px 28px rgba(0,0,0,0.25)",
              opacity: status === "disconnected" ? 0.85 : 1,
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <BotIcon bot={bot} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate" title={title}>
                    {title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {meta.pulse && (
                      <span
                        className="h-1.5 w-1.5 rounded-full animate-pulse flex-shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                    )}
                    <span
                      className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        color: meta.color,
                        backgroundColor: meta.bg,
                        border: `1px solid ${meta.border}`,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>
              </div>
              <ExternalLink
                className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                style={{ color: "#64748b" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: "#334155" }}
                >
                  Running
                </p>
                <p className="text-xl font-black" style={{ color: "#f0f4ff" }}>
                  {days} {days === 1 ? "Day" : "Days"}
                </p>
              </div>
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: "#334155" }}
                >
                  Net P&amp;L
                </p>
                <p
                  className="text-xl font-black font-mono"
                  style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
                >
                  {pnlPositive ? "+" : "-"}${Math.abs(pnl).toFixed(2)}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
