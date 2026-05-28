"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import { BotExchangeIcons } from "@/components/freedombot/dashboard/BotExchangeIcons";
import { ExchangeIcon } from "@/components/freedombot/dashboard/ExchangeIcon";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";
import { BRAND_CURVE_STROKE } from "@/lib/chart-brand-colors";
import { freedombotBotDetailPath } from "@/lib/freedombot/dashboard-path";

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
  { label: string; color: string; bg: string; border: string }
> = {
  live: {
    label: "Running",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.25)",
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

interface BotGroup {
  botKey: string;
  label: string;
  deployments: DashboardDeployment[];
  multiExchange: boolean;
}

function buildBotGroups(
  deployments: DashboardDeployment[],
  publicBots: PublicBotApiRow[],
): BotGroup[] {
  const byBot = new Map<string, DashboardDeployment[]>();
  for (const dep of deployments) {
    const list = byBot.get(dep.bot) ?? [];
    list.push(dep);
    byBot.set(dep.bot, list);
  }

  const groups: BotGroup[] = [...byBot.entries()].map(([botKey, deps]) => ({
    botKey,
    label: botLabel(botKey, publicBots),
    deployments: sortDeployments(deps).sort((a, b) =>
      exchangeLabel(a.exchange).localeCompare(exchangeLabel(b.exchange)),
    ),
    multiExchange: deps.length > 1,
  }));

  const groupTier = (g: BotGroup) => {
    const best = Math.min(...g.deployments.map((d) => {
      const s = displayStatus(d);
      if (s === "live") return 0;
      if (s === "paused") return 1;
      return 2;
    }));
    return best;
  };

  return groups.sort((a, b) => {
    const ta = groupTier(a);
    const tb = groupTier(b);
    if (ta !== tb) return ta - tb;
    if (a.multiExchange !== b.multiExchange) return a.multiExchange ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function resolveBotRow(
  dep: DashboardDeployment,
  publicBots: PublicBotApiRow[],
): PublicBotApiRow {
  return (
    publicBots.find((b) => b.deployKey === dep.bot) ?? {
      id: "crypto" as const,
      label: botLabel(dep.bot, publicBots),
      shortLabel: dep.bot,
      deployKey: dep.bot,
      botSource: "",
      icon: "₿",
      logo: null,
      publicLive: true,
    }
  );
}

interface RunningBotCardsProps {
  deployments: DashboardDeployment[];
  publicBots: PublicBotApiRow[];
}

export function RunningBotCards({ deployments, publicBots }: RunningBotCardsProps) {
  const pathname = usePathname();
  const groups = buildBotGroups(deployments, publicBots);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.botKey}>
          {group.multiExchange && (
            <div className="flex items-center gap-2.5 mb-3 px-0.5">
              <BotExchangeIcons
                bot={resolveBotRow(group.deployments[0], publicBots)}
                exchange={group.deployments[0].exchange}
                size={28}
              />
              <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                <h3 className="text-sm font-black text-white">{group.label}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>
                  {group.deployments.length} exchanges
                </span>
              </div>
            </div>
          )}

          <div
            className={
              group.multiExchange
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            }
          >
            {group.deployments.map((dep) => (
              <RunningBotCard
                key={dep.id}
                dep={dep}
                publicBots={publicBots}
                pathname={pathname}
                exchangeForward={group.multiExchange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RunningBotCard({
  dep,
  publicBots,
  pathname,
  exchangeForward,
}: {
  dep: DashboardDeployment;
  publicBots: PublicBotApiRow[];
  pathname: string;
  exchangeForward: boolean;
}) {
  const bot = resolveBotRow(dep, publicBots);
  const status = displayStatus(dep);
  const meta = STATUS_META[status];
  const days = runningDays(dep.createdAt);
  const pnl = dep.lifetimeRealizedPnl ?? 0;
  const pnlPositive = pnl >= 0;
  const href = freedombotBotDetailPath(pathname, dep.id);
  const label = botLabel(dep.bot, publicBots);
  const exchangeName = exchangeLabel(dep.exchange);
  const title = `${label} on ${exchangeName}`;

  return (
    <Link
      href={href}
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
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {exchangeForward ? (
            <div
              className="flex-shrink-0 rounded-full flex items-center justify-center"
              style={{
                width: 44,
                height: 44,
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(90,140,220,0.15)",
              }}
            >
              <ExchangeIcon exchange={dep.exchange} size={32} />
            </div>
          ) : (
            <BotExchangeIcons bot={bot} exchange={dep.exchange} size={40} />
          )}
          <div className="min-w-0">
            {exchangeForward ? (
              <>
                <p className="text-base font-black text-white truncate" title={title}>
                  {exchangeName}
                </p>
                <p
                  className="text-[11px] font-semibold truncate mt-0.5"
                  style={{ color: BRAND_CURVE_STROKE }}
                >
                  {label}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-white truncate" title={title}>
                  {label}
                </p>
                <p className="text-[11px] font-semibold truncate mt-0.5" style={{ color: "#64748b" }}>
                  {exchangeName}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
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
          <ChevronRight
            className="h-4 w-4 opacity-0 group-hover:opacity-60 transition-opacity"
            style={{ color: "#64748b" }}
          />
        </div>
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
            {pnlPositive ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
          </p>
        </div>
      </div>
    </Link>
  );
}
