"use client";

import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import type { PublicBotApiRow } from "@/hooks/use-public-bots";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";
import type { DashboardDeployment } from "@/components/freedombot/dashboard/RunningBotCards";

export interface DashboardSummaryData {
  lifetimeRealizedPnl: number;
  firstBot: {
    bot: string;
    exchange: string;
    deployedAt: string | null;
  } | null;
  exchanges: string[];
}

function greetingName(user: User): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function botLabel(deployKey: string, publicBots: PublicBotApiRow[]): string {
  const fromRegistry = publicBots.find((b) => b.deployKey === deployKey);
  if (fromRegistry) return fromRegistry.label;
  const fromCatalog = CRYPTO_BOTS.find((b) => b.deployKey === deployKey);
  return fromCatalog?.label ?? deployKey;
}

function countRunningBots(deployments: DashboardDeployment[]): number {
  return deployments.filter(
    (d) => d.status === "active" && d.wallet?.status !== "invalid",
  ).length;
}

function countPausedBots(deployments: DashboardDeployment[]): number {
  return deployments.filter((d) => d.status === "paused").length;
}

function uniqueExchangesFromDeployments(deployments: DashboardDeployment[]): string[] {
  return [...new Set(deployments.map((d) => d.exchange).filter(Boolean))].sort();
}

function StatCell({
  label,
  value,
  valueColor,
  className,
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: "#334155" }}
      >
        {label}
      </p>
      <p className="text-base sm:text-lg font-black leading-snug" style={{ color: valueColor ?? "#f0f4ff" }}>
        {value}
      </p>
    </div>
  );
}

interface DashboardSummaryProps {
  user: User;
  deployments: DashboardDeployment[];
  summary: DashboardSummaryData;
  publicBots: PublicBotApiRow[];
}

export function DashboardSummary({
  user,
  deployments,
  summary,
  publicBots,
}: DashboardSummaryProps) {
  const joinedAt = user.metadata?.creationTime ?? null;
  const pnl = summary.lifetimeRealizedPnl;
  const pnlPositive = pnl >= 0;
  const runningCount = countRunningBots(deployments);
  const pausedCount = countPausedBots(deployments);
  const exchanges =
    summary.exchanges.length > 0
      ? summary.exchanges
      : uniqueExchangesFromDeployments(deployments);
  const exchangeNames = exchanges.map(exchangeLabel);

  const firstBotLabel = summary.firstBot
    ? botLabel(summary.firstBot.bot, publicBots)
    : null;
  const firstBotExchange = summary.firstBot
    ? exchangeLabel(summary.firstBot.exchange)
    : null;
  const firstBotValue =
    firstBotLabel && firstBotExchange
      ? `${firstBotLabel} · ${firstBotExchange} · ${formatMonthYear(summary.firstBot?.deployedAt)}`
      : "—";

  return (
    <section
      className="rounded-2xl px-5 py-6 sm:px-8 sm:py-7"
      style={{
        backgroundColor: "#0c1a30",
        border: "1px solid rgba(59,130,246,0.35)",
        boxShadow: "0 0 0 1px rgba(59,130,246,0.08), 0 8px 28px rgba(0,0,0,0.25)",
      }}
    >
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Hello, {greetingName(user)}
        </h1>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "#64748b" }}>
          Here&apos;s your summary of the journey so far:
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
        <StatCell label="Joined" value={formatMonthYear(joinedAt)} />
        <StatCell
          label="First bot"
          value={firstBotValue}
          className="col-span-2 sm:col-span-1 lg:col-span-1"
        />
        <StatCell
          label="Lifetime P&L"
          value={`${pnlPositive ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`}
          valueColor={pnlPositive ? "#34d399" : "#f87171"}
          className="font-mono"
        />
        <StatCell label="Running bots" value={runningCount} />
        <StatCell label="Paused bots" value={pausedCount} />
        <StatCell
          label="Exchanges"
          value={
            exchanges.length === 0
              ? "—"
              : `${exchanges.length} · ${exchangeNames.join(", ")}`
          }
          className="col-span-2 sm:col-span-3 lg:col-span-1"
        />
      </div>
    </section>
  );
}
