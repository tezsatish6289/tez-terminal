"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Bot, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatUsdtHeadline } from "@/components/admin/AdminStatCard";
import { AdminColumnHeader } from "@/components/admin/AdminInfoTip";
import { AdminDeploymentTradesInline } from "@/components/admin/AdminDeploymentTradesInline";
import {
  computeMirroringStatus,
  mirroringStatusColorClass,
  mirroringStatusTooltip,
  type MirroringDisplayStatus,
} from "@/lib/freedombot/mirroring-status-shared";

export interface SegmentUserRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  firstBotDate: string | null;
  runningDays: number;
  runningBots: number;
  pausedBots: number;
  exchangeCount: number;
  capitalUsdt: number;
  totalTrades: number;
  netPnlUsdt: number;
}

interface DeploymentWallet {
  total: number | null;
  available: number | null;
  currency: string;
  status: "valid" | "invalid";
  error: string | null;
  checkedAt: string | null;
}

export interface SegmentDeploymentRow {
  deploymentId: string;
  userId: string;
  bot: string;
  botLabel: string;
  exchange: string;
  firstDeployedAt: string | null;
  deploymentStatus: string;
  running: boolean;
  mirroringStatus?: MirroringDisplayStatus;
  mirroringLabel?: string;
  autoTradeEnabled?: boolean | null;
  dailyLossHaltedToday?: boolean;
  lifetimeRealizedPnl: number;
  closedTradeCount?: number;
  openTradeCount?: number;
  pnlCurrency: string;
  wallet: DeploymentWallet | null;
}

function walletTooltip(
  wallet: DeploymentWallet | null,
): string {
  if (!wallet) return "Wallet balance has not been refreshed yet.";
  const when = wallet.checkedAt
    ? `Last checked ${format(new Date(wallet.checkedAt), "MMM d, h:mm a")}`
    : "Last checked: unknown";
  if (wallet.status === "invalid") {
    return `${wallet.error ?? "Connection invalid"} — ${when}`;
  }
  const available =
    wallet.available != null
      ? `Available ${wallet.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${wallet.currency}`
      : null;
  return [available, when].filter(Boolean).join(" — ");
}

interface SegmentUserTableProps {
  rows: SegmentUserRow[];
  deployments: SegmentDeploymentRow[];
  segmentLabel?: string;
  user: User;
}

export function SegmentUserTable({ rows, deployments, segmentLabel, user }: SegmentUserTableProps) {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedDeployments, setExpandedDeployments] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedUsers(new Set());
    setExpandedDeployments(new Set());
  }, [segmentLabel, rows.length]);

  const deploymentsByUser = useMemo(() => {
    const map = new Map<string, SegmentDeploymentRow[]>();
    for (const dep of deployments) {
      const list = map.get(dep.userId) ?? [];
      list.push(dep);
      map.set(dep.userId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.botLabel.localeCompare(b.botLabel) || a.exchange.localeCompare(b.exchange));
    }
    return map;
  }, [deployments]);

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        setExpandedDeployments((deps) => {
          const userDeps = deploymentsByUser.get(userId) ?? [];
          const depIds = new Set(userDeps.map((d) => d.deploymentId));
          return new Set([...deps].filter((id) => !depIds.has(id)));
        });
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleDeployment = (deploymentId: string) => {
    setExpandedDeployments((prev) => {
      const next = new Set(prev);
      if (next.has(deploymentId)) next.delete(deploymentId);
      else next.add(deploymentId);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 opacity-40">
        <Bot className="h-12 w-12 text-muted-foreground" />
        <p className="text-xs font-bold uppercase tracking-widest text-white">No users</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1076px]">
        <div className="grid grid-cols-[28px_minmax(160px,1.4fr)_100px_88px_72px_72px_88px_100px_88px_100px] gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
          <span />
          <span>User</span>
          <span>First bot</span>
          <span className="text-right">Running days</span>
          <span className="text-right">Running</span>
          <span className="text-right">Paused</span>
          <span className="text-right">Exchanges</span>
          <span className="text-right">Capital</span>
          <span className="text-right">Total trades</span>
          <span className="text-right">Lifetime PnL</span>
        </div>

        {rows.map((row) => {
          const userExpanded = expandedUsers.has(row.userId);
          const userDeps = deploymentsByUser.get(row.userId) ?? [];
          const pnlColor =
            row.netPnlUsdt > 0
              ? "text-emerald-400"
              : row.netPnlUsdt < 0
                ? "text-rose-400"
                : "text-muted-foreground";

          return (
            <div key={row.userId} className="border-b border-white/[0.04] last:border-0">
              <button
                type="button"
                onClick={() => toggleUser(row.userId)}
                className="grid w-full grid-cols-[28px_minmax(160px,1.4fr)_100px_88px_72px_72px_88px_100px_88px_100px] gap-2 px-4 py-3.5 items-center hover:bg-white/[0.02] text-left transition-colors"
              >
                <span className="flex justify-center">
                  {userExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-accent shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{row.displayName || "—"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{row.email ?? "—"}</div>
                  <div className="text-[10px] font-mono text-muted-foreground/50 truncate">{row.userId}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.firstBotDate ? format(new Date(row.firstBotDate), "MMM d, yyyy") : "—"}
                </div>
                <div className="text-right font-mono text-sm text-white">
                  {row.runningDays > 0 ? row.runningDays : "—"}
                </div>
                <div className="text-right font-mono text-sm text-emerald-400">{row.runningBots}</div>
                <div className="text-right font-mono text-sm text-amber-400">{row.pausedBots}</div>
                <div className="text-right font-mono text-sm text-white">{row.exchangeCount}</div>
                <div className="text-right font-mono text-sm text-sky-400">
                  {row.capitalUsdt > 0 ? formatUsdtHeadline(row.capitalUsdt) : "—"}
                </div>
                <div className="text-right font-mono text-sm text-white">
                  {row.totalTrades > 0 ? row.totalTrades.toLocaleString() : "—"}
                </div>
                <div className={cn("text-right font-mono text-sm font-bold", pnlColor)}>
                  {row.netPnlUsdt >= 0 ? "+" : ""}
                  {row.netPnlUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </button>

              {userExpanded ? (
                <div className="bg-white/[0.015] border-t border-white/[0.04]">
                  {userDeps.length === 0 ? (
                    <div className="px-10 py-4 text-xs text-muted-foreground/60">No deployments in scope</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[28px_1fr_100px_120px_100px_96px_140px_120px_36px] gap-2 px-4 py-2 border-b border-white/[0.04] text-[9px] font-black uppercase tracking-wider text-muted-foreground/40">
                        <span />
                        <span>Bot</span>
                        <span>Exchange</span>
                        <span>First deploy</span>
                        <span>Status</span>
                        <AdminColumnHeader
                          label="Mirroring"
                          tip="Whether new platform signals are copied to this exchange."
                          className="text-[9px]"
                        />
                        <span className="text-right">Wallet</span>
                        <span className="text-right">Lifetime PnL</span>
                        <span />
                      </div>
                      {userDeps.map((dep) => {
                        const depExpanded = expandedDeployments.has(dep.deploymentId);
                        const depPnlColor =
                          dep.lifetimeRealizedPnl > 0
                            ? "text-emerald-400"
                            : dep.lifetimeRealizedPnl < 0
                              ? "text-rose-400"
                              : "text-muted-foreground";
                        const mirroring =
                          dep.mirroringStatus && dep.mirroringLabel
                            ? { status: dep.mirroringStatus, label: dep.mirroringLabel }
                            : computeMirroringStatus(dep.running, {
                                autoTradeEnabled: dep.autoTradeEnabled ?? null,
                                dailyLossHaltedToday: dep.dailyLossHaltedToday ?? false,
                              });

                        return (
                          <div key={dep.deploymentId} className="border-b border-white/[0.03] last:border-0">
                            <div className="flex items-stretch">
                              <button
                                type="button"
                                onClick={() => toggleDeployment(dep.deploymentId)}
                                className="grid flex-1 min-w-0 grid-cols-[28px_1fr_100px_120px_100px_96px_140px_120px] gap-2 pl-8 pr-2 py-3 items-center hover:bg-white/[0.02] text-left transition-colors"
                              >
                                <span className="flex justify-center">
                                  {depExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-accent shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                                  )}
                                </span>
                                <div>
                                  <div className="text-sm font-semibold text-white">{dep.botLabel}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground/60">{dep.bot}</div>
                                </div>
                                <div className="text-xs font-mono text-muted-foreground">{dep.exchange}</div>
                                <div className="text-xs text-muted-foreground">
                                  {dep.firstDeployedAt
                                    ? format(new Date(dep.firstDeployedAt), "MMM d, yyyy")
                                    : "—"}
                                </div>
                                <div>
                                  <span
                                    className={cn(
                                      "inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase",
                                      dep.running
                                        ? "bg-emerald-500/15 text-emerald-400"
                                        : "bg-white/5 text-muted-foreground",
                                    )}
                                  >
                                    {dep.running ? "Running" : "Stopped"}
                                  </span>
                                </div>
                                <div title={mirroringStatusTooltip(mirroring)}>
                                  <span
                                    className={cn(
                                      "text-xs font-black uppercase tracking-wide",
                                      mirroringStatusColorClass(mirroring.status),
                                    )}
                                  >
                                    {mirroring.label}
                                  </span>
                                </div>
                                <div className="text-right" title={walletTooltip(dep.wallet)}>
                                  {dep.wallet == null ? (
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                                      Pending
                                    </span>
                                  ) : dep.wallet.status === "invalid" ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                                      Invalid
                                    </span>
                                  ) : (
                                    <div className="font-mono text-sm font-bold text-emerald-400">
                                      {(dep.wallet.total ?? 0).toLocaleString(undefined, {
                                        maximumFractionDigits: 2,
                                      })}{" "}
                                      <span className="text-[10px] font-semibold text-muted-foreground">
                                        {dep.wallet.currency}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className={cn("text-right font-mono text-sm font-bold", depPnlColor)}>
                                  {dep.lifetimeRealizedPnl >= 0 ? "+" : ""}
                                  {dep.lifetimeRealizedPnl.toLocaleString(undefined, {
                                    maximumFractionDigits: 4,
                                  })}{" "}
                                  <span className="text-[10px] font-semibold text-muted-foreground">
                                    {dep.pnlCurrency}
                                  </span>
                                </div>
                              </button>
                              <Link
                                href={`/admin/bot-users/${dep.deploymentId}`}
                                title="Open full deployment page"
                                className="flex items-center justify-center px-3 text-muted-foreground/40 hover:text-accent transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                            <AdminDeploymentTradesInline
                              deploymentId={dep.deploymentId}
                              user={user}
                              active={depExpanded}
                              lifetimeRealizedPnl={dep.lifetimeRealizedPnl}
                              closedTradeCount={dep.closedTradeCount}
                              openTradeCount={dep.openTradeCount}
                            />
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
