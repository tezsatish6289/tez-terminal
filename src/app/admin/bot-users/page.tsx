"use client";

import Link from "next/link";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  ShieldAlert,
  Search,
  RefreshCw,
  Bot,
  ChevronRight,
  Trash2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { AdminColumnHeader } from "@/components/admin/AdminInfoTip";
import { AdminCtaWithInfo } from "@/components/admin/AdminCtaLabel";
import { AdminStatCard, formatUsdtHeadline } from "@/components/admin/AdminStatCard";
import {
  computeMirroringStatus,
  mirroringStatusColorClass,
  mirroringStatusTooltip,
  type MirroringDisplayStatus,
} from "@/lib/freedombot/mirroring-status-shared";

const ADMIN_EMAIL = "hello@tezterminal.com";

/** Drill-down filter for headline stats (lifetime scope). */
type SegmentFilter =
  | null
  | "total_users"
  | "active_users"
  | "capital"
  | "volume"
  | "profit"
  | "no_bot"
  | "stopped_only"
  | "all_deployments"
  | "active_deployments";

interface PlatformSummaryMetrics {
  totalUsers: number;
  deployedUsers?: number;
  activeUsers: number;
  totalCapitalUsdt: number;
  totalVolumeUsdt: number;
  totalProfitUsdt: number;
  accountsNoBot: number;
  accountsStoppedOnly: number;
  totalDeployments: number;
  activeDeployments: number;
}

interface AccountNoBot {
  userId: string;
  email: string | null;
  displayName: string | null;
}

interface PlatformSummary {
  metrics: PlatformSummaryMetrics;
  userIdsActive: string[];
  userIdsStoppedOnly: string[];
  accountsNoBot: AccountNoBot[];
  rates: { source: string; fetchedAt: string; inrPerUsdt: number };
}

/** Hover-tooltip text for the wallet column. Surfaces freshness and (for
 *  invalid links) the exact error returned by the venue API so the admin
 *  doesn't have to dig into logs. */
function walletTooltip(
  wallet: { status: "valid" | "invalid"; error: string | null; checkedAt: string | null; available: number | null; currency: string } | null,
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

interface DeploymentWallet {
  total: number | null;
  available: number | null;
  currency: string;
  status: "valid" | "invalid";
  error: string | null;
  checkedAt: string | null;
}

interface DeploymentRow {
  deploymentId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
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
  liveMirroringActive?: boolean;
  lifetimeRealizedPnl: number;
  closedTradeCount?: number;
  pnlCurrency: string;
  pnlNote: string;
  wallet: DeploymentWallet | null;
}

export default function AdminBotUsersPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [botFilter, setBotFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeploymentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [walletRefreshAllBusy, setWalletRefreshAllBusy] = useState(false);
  const [walletRefreshAllSummary, setWalletRefreshAllSummary] = useState<string | null>(null);
  const [migrateDefaultsBusy, setMigrateDefaultsBusy] = useState(false);
  const [migrateDefaultsSummary, setMigrateDefaultsSummary] = useState<string | null>(null);
  const [migrateConfirmOpen, setMigrateConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>(null);

  const fetchSummary = useCallback(async () => {
    if (!user) return;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const idToken = await user.getIdToken();
      const q = new URLSearchParams({ period: "lifetime" });
      if (botFilter !== "all") q.set("bot", botFilter);
      const res = await fetch(`/api/admin/bot-deployments/summary?${q}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load summary");
      setSummary({
        metrics: data.metrics,
        userIdsActive: data.userIdsActive ?? [],
        userIdsStoppedOnly: data.userIdsStoppedOnly ?? [],
        accountsNoBot: data.accountsNoBot ?? [],
        rates: data.rates,
      });
    } catch (e: unknown) {
      setSummary(null);
      setSummaryError(e instanceof Error ? e.message : "Failed to load platform summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [user, botFilter]);

  const fetchDeployments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const q = botFilter !== "all" ? `?bot=${encodeURIComponent(botFilter)}` : "";
      const res = await fetch(`/api/admin/bot-deployments${q}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setDeployments(data.deployments ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setDeployments([]);
    } finally {
      setLoading(false);
    }
  }, [user, botFilter]);

  useEffect(() => {
    if (isAdmin) {
      void fetchDeployments();
      void fetchSummary();
    }
  }, [isAdmin, fetchDeployments, fetchSummary]);

  useEffect(() => {
    setSegmentFilter(null);
  }, [botFilter]);

  const toggleSegment = (next: SegmentFilter) => {
    setSegmentFilter((prev) => (prev === next ? null : next));
  };

  const activeUserSet = useMemo(
    () => new Set(summary?.userIdsActive ?? []),
    [summary?.userIdsActive],
  );
  const stoppedOnlyUserSet = useMemo(
    () => new Set(summary?.userIdsStoppedOnly ?? []),
    [summary?.userIdsStoppedOnly],
  );

  const segmentDeployments = useMemo(() => {
    if (segmentFilter === "no_bot") return [];
    let rows = deployments;
    switch (segmentFilter) {
      case "active_deployments":
        return rows.filter((d) => d.running);
      case "active_users":
        return rows.filter((d) => activeUserSet.has(d.userId));
      case "stopped_only":
        return rows.filter((d) => stoppedOnlyUserSet.has(d.userId));
      case "capital":
        return rows.filter(
          (d) =>
            d.running &&
            d.wallet?.status === "valid" &&
            d.wallet.total != null &&
            d.wallet.total > 0,
        );
      case "volume":
        return rows.filter((d) => (d.closedTradeCount ?? 0) > 0);
      case "profit":
        return rows.filter((d) => d.lifetimeRealizedPnl !== 0);
      case "total_users":
      case "all_deployments":
      default:
        return rows;
    }
  }, [deployments, segmentFilter, activeUserSet, stoppedOnlyUserSet]);

  const filteredAccountsNoBot = useMemo(() => {
    const list = summary?.accountsNoBot ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (a) =>
        a.email?.toLowerCase().includes(q) ||
        a.displayName?.toLowerCase().includes(q) ||
        a.userId.toLowerCase().includes(q),
    );
  }, [summary?.accountsNoBot, search]);

  const refreshAllWallets = useCallback(async () => {
    if (!user) return;
    setWalletRefreshAllBusy(true);
    setWalletRefreshAllSummary(null);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const q = botFilter !== "all" ? `?bot=${encodeURIComponent(botFilter)}` : "";
      const res = await fetch(`/api/admin/bot-deployments/refresh-wallets${q}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      const s = data.summary ?? {};
      const summary = `${s.valid ?? 0} valid · ${s.invalid ?? 0} invalid · ${s["no-credentials"] ?? 0} no-credentials · ${s.error ?? 0} errored (of ${data.refreshed ?? 0})`;
      setWalletRefreshAllSummary(summary);
      // Log per-deployment outcomes to the console so the admin can dig in
      // when something looks off without us having to render a giant table.
      if (Array.isArray(data.outcomes)) {
        console.log("[Admin] Wallet refresh outcomes:", data.outcomes);
      }
      await fetchDeployments();
      await fetchSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setWalletRefreshAllBusy(false);
    }
  }, [user, botFilter, fetchDeployments, fetchSummary]);

  const migrateTradingDefaults = useCallback(async () => {
    if (!user) return;
    setMigrateDefaultsBusy(true);
    setMigrateDefaultsSummary(null);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/migrate-trading-defaults", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Migration failed");
      setMigrateDefaultsSummary(
        `Updated ${data.updated ?? 0} of ${data.scanned ?? 0} secret docs to 1% risk / 3% daily loss cap (legacy 0.5% / 5% or missing fields only).`,
      );
      await fetchDeployments();
      await fetchSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setMigrateDefaultsBusy(false);
      setMigrateConfirmOpen(false);
    }
  }, [user, fetchDeployments, fetchSummary]);

  const confirmDelete = async () => {
    if (!user || !deleteTarget) return;
    const id = deleteTarget.deploymentId;
    setDeletingId(id);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/bot-deployments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setDeployments((prev) => prev.filter((d) => d.deploymentId !== id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return segmentDeployments;
    const q = search.toLowerCase();
    return segmentDeployments.filter(
      (d) =>
        d.email?.toLowerCase().includes(q) ||
        d.displayName?.toLowerCase().includes(q) ||
        d.userId.toLowerCase().includes(q) ||
        d.deploymentId.toLowerCase().includes(q) ||
        d.botLabel.toLowerCase().includes(q) ||
        d.exchange.toLowerCase().includes(q),
    );
  }, [segmentDeployments, search]);

  /** When the summary API fails, derive headline stats from the deployment list. */
  const fallbackMetrics = useMemo((): PlatformSummaryMetrics | null => {
    if (summary?.metrics || deployments.length === 0) return null;
    const seenPairs = new Set<string>();
    let profit = 0;
    let capital = 0;
    const allUids = new Set<string>();
    const activeUids = new Set<string>();
    for (const d of deployments) {
      if (!d.userId) continue;
      allUids.add(d.userId);
      if (d.running) activeUids.add(d.userId);
      const pair = `${d.userId}::${d.exchange}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        profit += d.lifetimeRealizedPnl ?? 0;
      }
      if (d.running && d.wallet?.status === "valid" && d.wallet.total != null) {
        capital += d.wallet.total;
      }
    }
    let stoppedOnly = 0;
    for (const uid of allUids) {
      if (!activeUids.has(uid)) stoppedOnly++;
    }
    return {
      totalUsers: allUids.size,
      deployedUsers: allUids.size,
      activeUsers: activeUids.size,
      totalCapitalUsdt: Math.round(capital * 100) / 100,
      totalVolumeUsdt: 0,
      totalProfitUsdt: Math.round(profit * 100) / 100,
      accountsNoBot: 0,
      accountsStoppedOnly: stoppedOnly,
      totalDeployments: deployments.length,
      activeDeployments: deployments.filter((d) => d.running).length,
    };
  }, [summary?.metrics, deployments]);

  const m = summary?.metrics ?? fallbackMetrics ?? undefined;
  const showNoBotTable = segmentFilter === "no_bot";

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available to administrators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent" />
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Bot users</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-xl">
              Lifetime platform metrics (all amounts in USDT). Click a stat to filter the table. Capital uses active
              deployments only; volume is closed-trade notional (one-sided); profit is production closed trades only.
            </p>
            {summary?.rates && (
              <p className="text-[10px] text-muted-foreground/50 font-mono">
                FX: INR→USDT via {summary.rates.source} ({summary.rates.fetchedAt.slice(0, 16)} UTC)
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminCtaWithInfo description="Writes 1% risk per trade and 3% daily loss cap to exchange secrets still on legacy defaults (0.5% / 5%) or missing fields. Does not change users who already chose other values.">
              <button
                type="button"
                onClick={() => setMigrateConfirmOpen(true)}
                disabled={migrateDefaultsBusy || loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-400/30 bg-blue-500/10 text-xs font-bold uppercase tracking-wider text-blue-300 hover:bg-blue-500/15 disabled:opacity-50"
              >
                <Shield className={cn("h-3.5 w-3.5", migrateDefaultsBusy && "animate-pulse")} />
                {migrateDefaultsBusy ? "Migrating…" : "Apply risk defaults"}
              </button>
            </AdminCtaWithInfo>
            <AdminCtaWithInfo description="Fetches current wallet balance from each exchange for every deployment in this list. Updates connection status and balances; does not sync trade PnL or mirroring.">
              <button
                type="button"
                onClick={() => void refreshAllWallets()}
                disabled={walletRefreshAllBusy || loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", walletRefreshAllBusy && "animate-spin")}
                />
                {walletRefreshAllBusy ? "Refreshing wallets…" : "Refresh wallets"}
              </button>
            </AdminCtaWithInfo>
            <AdminCtaWithInfo description="Reloads the deployment list from the database (PnL aggregates, mirroring status, wallet snapshots as last saved). Does not call exchange APIs.">
              <button
                type="button"
                onClick={() => fetchDeployments()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/[0.06] disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Refresh
              </button>
            </AdminCtaWithInfo>
          </div>
        </header>

        {migrateDefaultsSummary && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] px-4 py-2 text-xs text-blue-200">
            <span className="font-bold uppercase tracking-wider mr-2">Risk defaults:</span>
            {migrateDefaultsSummary}
          </div>
        )}

        {walletRefreshAllSummary && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2 text-xs text-emerald-200">
            <span className="font-bold uppercase tracking-wider mr-2">Wallet refresh:</span>
            {walletRefreshAllSummary}
            <span className="ml-2 text-muted-foreground/70">
              (see browser console for per-deployment outcomes)
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {summaryError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Platform summary: {summaryError}
            {fallbackMetrics ? " — showing estimates from the deployment table below." : ""}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Period
              </span>
              <span className="px-2.5 py-1 rounded-lg border border-accent/30 bg-accent/10 text-[10px] font-black uppercase text-accent">
                Lifetime
              </span>
              <span className="text-[10px] text-muted-foreground/40">(date range filters coming soon)</span>
              {segmentFilter && (
                <button
                  type="button"
                  onClick={() => setSegmentFilter(null)}
                  className="ml-auto text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <AdminStatCard
                label="Total users"
                value={summaryLoading ? "…" : String(m?.totalUsers ?? 0)}
                sublabel={
                  m
                    ? `${m.deployedUsers ?? m.activeUsers + m.accountsStoppedOnly} deployed · ${m.accountsNoBot} no bot`
                    : "All accounts in scope"
                }
                active={segmentFilter === "total_users"}
                onClick={() => toggleSegment("total_users")}
              />
              <AdminStatCard
                label="Active users"
                value={summaryLoading ? "…" : String(m?.activeUsers ?? 0)}
                sublabel="≥1 running bot"
                active={segmentFilter === "active_users"}
                onClick={() => toggleSegment("active_users")}
                valueClassName="text-emerald-400"
              />
              <AdminStatCard
                label="Capital deployed"
                value={summaryLoading ? "…" : formatUsdtHeadline(m?.totalCapitalUsdt ?? 0)}
                sublabel="Active · wallet balance"
                active={segmentFilter === "capital"}
                onClick={() => toggleSegment("capital")}
                valueClassName="text-sky-400"
              />
              <AdminStatCard
                label="Volume traded"
                value={summaryLoading ? "…" : formatUsdtHeadline(m?.totalVolumeUsdt ?? 0)}
                sublabel="Closed · one-sided notional"
                active={segmentFilter === "volume"}
                onClick={() => toggleSegment("volume")}
              />
              <AdminStatCard
                label="Profit (lifetime)"
                value={summaryLoading ? "…" : formatUsdtHeadline(m?.totalProfitUsdt ?? 0)}
                sublabel="Realized · production"
                active={segmentFilter === "profit"}
                onClick={() => toggleSegment("profit")}
                valueClassName={
                  (m?.totalProfitUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }
              />
              <AdminStatCard
                label="No bot"
                value={summaryLoading ? "…" : String(m?.accountsNoBot ?? 0)}
                sublabel="Accounts · never deployed"
                active={segmentFilter === "no_bot"}
                onClick={() => toggleSegment("no_bot")}
              />
              <AdminStatCard
                label="Stopped only"
                value={summaryLoading ? "…" : String(m?.accountsStoppedOnly ?? 0)}
                sublabel="Users · no active bot"
                active={segmentFilter === "stopped_only"}
                onClick={() => toggleSegment("stopped_only")}
              />
              <AdminStatCard
                label="Deployments"
                value={summaryLoading ? "…" : String(m?.totalDeployments ?? deployments.length)}
                active={segmentFilter === "all_deployments"}
                onClick={() => toggleSegment("all_deployments")}
              />
              <AdminStatCard
                label="Active deployments"
                value={summaryLoading ? "…" : String(m?.activeDeployments ?? 0)}
                active={segmentFilter === "active_deployments"}
                onClick={() => toggleSegment("active_deployments")}
                valueClassName="text-emerald-400"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  type="text"
                  placeholder="Search email, name, user id, deployment id…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/30"
                />
              </div>
              <Select value={botFilter} onValueChange={setBotFilter}>
                <SelectTrigger className="w-full sm:w-[200px] border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-wider">
                  <SelectValue placeholder="Bot type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All bots</SelectItem>
                  <SelectItem value="CRYPTO">Crypto</SelectItem>
                  <SelectItem value="INDIAN_STOCKS">Indian stocks</SelectItem>
                  <SelectItem value="GOLD">Gold</SelectItem>
                  <SelectItem value="SILVER">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden">
              {showNoBotTable ? (
                <>
                  <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                    Accounts with no bot in this scope
                  </div>
                  {filteredAccountsNoBot.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                      <Bot className="h-12 w-12 text-muted-foreground" />
                      <p className="text-xs font-bold uppercase tracking-widest text-white">No accounts</p>
                    </div>
                  ) : (
                    filteredAccountsNoBot.map((a) => (
                      <div
                        key={a.userId}
                        className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {a.displayName || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{a.email ?? "—"}</div>
                          <div className="text-[10px] font-mono text-muted-foreground/50 truncate">{a.userId}</div>
                        </div>
                        <span className="text-[9px] font-black uppercase text-muted-foreground/60 shrink-0 ml-4">
                          No deployment
                        </span>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <>
              <div className="hidden lg:grid grid-cols-[28px_1.2fr_1fr_100px_120px_100px_96px_140px_120px_56px] gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                <span />
                <span>User</span>
                <span>Bot</span>
                <span>Exchange</span>
                <span>First deploy</span>
                <span>Status</span>
                <AdminColumnHeader
                  label="Mirroring"
                  tip="Whether new platform signals are copied to this exchange. On = active deployment with auto-trade enabled and not paused for daily loss today."
                />
                <span className="text-right">Wallet</span>
                <span className="text-right">Lifetime PnL</span>
                <span />
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                  <Bot className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-widest text-white">
                    {segmentFilter ? "No matching deployments" : "No deployments"}
                  </p>
                </div>
              ) : (
                filtered.map((d) => {
                  const pnlColor =
                    d.lifetimeRealizedPnl > 0
                      ? "text-emerald-400"
                      : d.lifetimeRealizedPnl < 0
                        ? "text-rose-400"
                        : "text-muted-foreground";
                  const mirroring =
                    d.mirroringStatus && d.mirroringLabel
                      ? { status: d.mirroringStatus, label: d.mirroringLabel }
                      : computeMirroringStatus(d.running, {
                          autoTradeEnabled: d.autoTradeEnabled ?? null,
                          dailyLossHaltedToday: d.dailyLossHaltedToday ?? false,
                        });

                  return (
                    <div
                      key={d.deploymentId}
                      className="flex items-stretch border-b border-white/[0.04] last:border-0"
                    >
                      <Link
                        href={`/admin/bot-users/${d.deploymentId}`}
                        className="grid flex-1 min-w-0 grid-cols-1 lg:grid-cols-[28px_1.2fr_1fr_100px_120px_100px_96px_140px_120px] gap-2 px-4 py-3.5 items-start lg:items-center hover:bg-white/[0.03] transition-colors text-left group"
                      >
                        <span className="hidden lg:flex justify-center pt-0.5">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-accent shrink-0 transition-colors" />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-bold text-white truncate">{d.displayName || "—"}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{d.email ?? "—"}</div>
                          <div className="text-[10px] font-mono text-muted-foreground/50 truncate lg:hidden">
                            {d.userId}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{d.botLabel}</div>
                          <div className="text-[10px] font-mono text-muted-foreground/60">{d.bot}</div>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">{d.exchange}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.firstDeployedAt ? format(new Date(d.firstDeployedAt), "MMM d, yyyy") : "—"}
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase",
                              d.running
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-white/5 text-muted-foreground",
                            )}
                          >
                            {d.running ? "Running" : "Stopped"}
                          </span>
                        </div>
                        <div title={mirroringStatusTooltip(mirroring)}>
                          <div className="flex items-center gap-2 lg:block">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 lg:hidden">
                              Mirroring
                            </span>
                            <span
                              className={cn(
                                "text-xs font-black uppercase tracking-wide",
                                mirroringStatusColorClass(mirroring.status),
                              )}
                            >
                              {mirroring.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right" title={walletTooltip(d.wallet)}>
                          {d.wallet == null ? (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                              Pending
                            </span>
                          ) : d.wallet.status === "invalid" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                              Invalid
                            </span>
                          ) : (
                            <div className="font-mono text-sm font-bold text-emerald-400">
                              {(d.wallet.total ?? 0).toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}{" "}
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {d.wallet.currency}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className={cn("text-right font-mono text-sm font-bold", pnlColor)}>
                          {d.lifetimeRealizedPnl >= 0 ? "+" : ""}
                          {d.lifetimeRealizedPnl.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}{" "}
                          <span className="text-[10px] font-semibold text-muted-foreground">{d.pnlCurrency}</span>
                        </div>
                      </Link>
                      <div className="flex items-center justify-center px-3 lg:px-2 shrink-0 border-l border-white/[0.04]">
                        <button
                          type="button"
                          title="Delete deployment"
                          disabled={deletingId === d.deploymentId}
                          onClick={() => setDeleteTarget(d)}
                          className="p-2 rounded-lg text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 transition-colors"
                        >
                          {deletingId === d.deploymentId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#141416] text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bot deployment?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This removes the deployment for{" "}
              <span className="font-semibold text-white">
                {deleteTarget?.displayName || deleteTarget?.email || "this user"}
              </span>{" "}
              on <span className="font-mono">{deleteTarget?.exchange}</span>. Stored API keys for this exchange will be
              cleared if they have no other deployment on it. The user must deploy the bot again from FreedomBot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/[0.04]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={!!deletingId}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletingId ? "Deleting…" : "Delete deployment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={migrateConfirmOpen} onOpenChange={setMigrateConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-[#141416] text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply platform risk defaults?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                Updates every exchange secret that still has the old defaults (
                <span className="font-mono text-white">0.5%</span> risk or{" "}
                <span className="font-mono text-white">5%</span> daily loss) or missing values to{" "}
                <span className="font-mono text-white">1%</span> risk and{" "}
                <span className="font-mono text-white">3%</span> daily loss cap.
              </span>
              <span className="block">
                Users who chose other values (e.g. 0.25% risk, 2% daily cap) are not changed. Live
                trading already uses the new defaults for legacy values; this writes them to the
                database so Bot Settings matches.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/[0.04]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void migrateTradingDefaults();
              }}
              disabled={migrateDefaultsBusy}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {migrateDefaultsBusy ? "Applying…" : "Apply to all legacy secrets"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
