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
import { AdminColumnHeader, AdminInfoTip } from "@/components/admin/AdminInfoTip";
import { AdminCtaWithInfo } from "@/components/admin/AdminCtaLabel";
import { RetentionMessagePreviewTip } from "@/components/admin/RetentionMessagePreviewTip";
import {
  BotUsersFlowchart,
  type BotUsersSegmentFilter,
  type FlowchartMetrics,
} from "@/components/admin/BotUsersFlowchart";
import { SegmentUserTable } from "@/components/admin/SegmentUserTable";
import {
  computeMirroringStatus,
  mirroringStatusColorClass,
  mirroringStatusTooltip,
  type MirroringDisplayStatus,
} from "@/lib/freedombot/mirroring-status-shared";
import {
  buildPauseRetentionHoverText,
  runningDaysFromFirstDeploy,
} from "@/lib/freedombot/retention-preview-text";
import {
  lifetimePnlBand,
  showsPauseRetentionModal,
  type RetentionExchangeStats,
} from "@/lib/freedombot/retention-stats-shared";

const EXCHANGE_LABELS: Record<string, string> = {
  BYBIT: "Bybit",
  COINDCX: "CoinDCX",
  HYPERLIQUID: "Hyperliquid",
};

const ADMIN_EMAIL = "hello@tezterminal.com";

interface AccountRow {
  userId: string;
  email: string | null;
  displayName: string | null;
}

interface PlatformSegments {
  neverDeployed: AccountRow[];
  churned: AccountRow[];
  hasBotNow: AccountRow[];
  activeUsers: string[];
  pausedUsers: string[];
  stoppedUsers: string[];
  profitableUsers: string[];
  newAccountUsers: string[];
  awaitingProfitsUsers: string[];
  noClosedTradesUsers: string[];
  activeProfitable: string[];
  activeAwaiting: string[];
  activeAwaitingOver30Days: string[];
  pausedProfitable: string[];
  pausedAwaiting: string[];
  exchanges: Record<
    string,
    {
      userIds: string[];
      capitalUserIds: string[];
      profitableUserIds: string[];
      awaitingUserIds: string[];
    }
  >;
}

interface UserDrilldownRow {
  userId: string;
  firstBotDate: string | null;
  runningDays: number;
  runningBots: number;
  pausedBots: number;
  exchangeCount: number;
  capitalUsdt: number;
  totalTrades: number;
  netPnlUsdt: number;
}

interface UserSegmentRow extends AccountRow, Omit<UserDrilldownRow, "userId"> {}

interface PlatformSummary {
  metrics: FlowchartMetrics;
  segments: PlatformSegments;
  userIdsActive: string[];
  userIdsStoppedOnly: string[];
  accountsNoBot: AccountRow[];
  userDrilldown: Record<string, UserDrilldownRow>;
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
  const [segmentFilter, setSegmentFilter] = useState<BotUsersSegmentFilter>(null);
  const [retentionStatsByExchange, setRetentionStatsByExchange] = useState<
    Record<string, RetentionExchangeStats>
  >({});

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
        segments: data.segments ?? {
          neverDeployed: [],
          churned: [],
          hasBotNow: [],
          activeUsers: [],
          pausedUsers: [],
          stoppedUsers: [],
          profitableUsers: [],
          newAccountUsers: [],
          awaitingProfitsUsers: [],
          noClosedTradesUsers: [],
          activeProfitable: [],
          activeAwaiting: [],
          activeAwaitingOver30Days: [],
          pausedProfitable: [],
          pausedAwaiting: [],
          exchanges: {},
        },
        userIdsActive: data.userIdsActive ?? [],
        userIdsStoppedOnly: data.userIdsStoppedOnly ?? [],
        accountsNoBot: data.accountsNoBot ?? [],
        userDrilldown: data.userDrilldown ?? {},
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

  const fetchRetentionStats = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/retention-stats", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok && data.stats && typeof data.stats === "object") {
        setRetentionStatsByExchange(data.stats as Record<string, RetentionExchangeStats>);
      }
    } catch {
      // Hover previews fall back to default p90 copy
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      void fetchDeployments();
      void fetchSummary();
      void fetchRetentionStats();
    }
  }, [isAdmin, fetchDeployments, fetchSummary, fetchRetentionStats]);

  useEffect(() => {
    setSegmentFilter(null);
  }, [botFilter]);

  const segmentUserSet = useMemo((): Set<string> | null => {
    const seg = summary?.segments;
    if (!seg || !segmentFilter) return null;
    switch (segmentFilter) {
      case "active_users":
        return new Set(seg.activeUsers);
      case "paused_users":
        return new Set(seg.pausedUsers);
      case "stopped_users":
        return new Set(seg.stoppedUsers);
      case "profitable":
        return new Set(seg.profitableUsers);
      case "new_account":
        return new Set(seg.newAccountUsers);
      case "awaiting_profits":
        return new Set(seg.awaitingProfitsUsers);
      case "no_closed_trades":
        return new Set(seg.noClosedTradesUsers);
      case "active_profitable":
        return new Set(seg.activeProfitable);
      case "active_awaiting":
        return new Set(seg.activeAwaiting);
      case "active_awaiting_over_30d":
        return new Set(seg.activeAwaitingOver30Days);
      case "paused_profitable":
        return new Set(seg.pausedProfitable);
      case "paused_awaiting":
        return new Set(seg.pausedAwaiting);
      case "exchange_bybit":
        return new Set(seg.exchanges.BYBIT?.userIds ?? []);
      case "exchange_coindcx":
        return new Set(seg.exchanges.COINDCX?.userIds ?? []);
      case "exchange_hyperliquid":
        return new Set(seg.exchanges.HYPERLIQUID?.userIds ?? []);
      case "exchange_capital_bybit":
        return new Set(seg.exchanges.BYBIT?.capitalUserIds ?? []);
      case "exchange_capital_coindcx":
        return new Set(seg.exchanges.COINDCX?.capitalUserIds ?? []);
      case "exchange_capital_hyperliquid":
        return new Set(seg.exchanges.HYPERLIQUID?.capitalUserIds ?? []);
      default:
        return null;
    }
  }, [summary?.segments, segmentFilter]);

  const segmentDeployments = useMemo(() => {
    const userLifecycleFilters: BotUsersSegmentFilter[] = [
      "sign_ups",
      "never_deployed",
      "churned",
      "has_bot_now",
    ];
    if (segmentFilter && userLifecycleFilters.includes(segmentFilter)) return [];

    let rows = deployments;
    if (segmentUserSet) {
      rows = rows.filter((d) => segmentUserSet.has(d.userId));
    }

    switch (segmentFilter) {
      case "active_deployments":
        return rows.filter((d) => d.running);
      case "capital":
      case "exchange_capital_bybit":
      case "exchange_capital_coindcx":
      case "exchange_capital_hyperliquid":
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
      case "exchange_bybit":
        return rows.filter((d) => d.exchange === "BYBIT");
      case "exchange_coindcx":
        return rows.filter((d) => d.exchange === "COINDCX");
      case "exchange_hyperliquid":
        return rows.filter((d) => d.exchange === "HYPERLIQUID");
      case "all_deployments":
      default:
        return rows;
    }
  }, [deployments, segmentFilter, segmentUserSet]);

  const segmentUserAccounts = useMemo((): AccountRow[] => {
    const seg = summary?.segments;
    if (!seg || !segmentFilter) return [];

    let list: AccountRow[] = [];
    switch (segmentFilter) {
      case "sign_ups":
        list = [...seg.neverDeployed, ...seg.churned, ...seg.hasBotNow];
        break;
      case "never_deployed":
        list = seg.neverDeployed;
        break;
      case "churned":
        list = seg.churned;
        break;
      case "has_bot_now":
        list = seg.hasBotNow;
        break;
      case "active_users":
      case "paused_users":
      case "stopped_users":
      case "profitable":
      case "new_account":
      case "awaiting_profits":
      case "no_closed_trades":
      case "active_profitable":
      case "active_awaiting":
      case "active_awaiting_over_30d":
      case "paused_profitable":
      case "paused_awaiting":
      case "exchange_capital_bybit":
      case "exchange_capital_coindcx":
      case "exchange_capital_hyperliquid": {
        const ids = segmentUserSet ? [...segmentUserSet] : [];
        const byId = new Map<string, AccountRow>();
        for (const a of [...seg.neverDeployed, ...seg.churned, ...seg.hasBotNow]) {
          byId.set(a.userId, a);
        }
        list = ids.map((uid) => byId.get(uid) ?? { userId: uid, email: null, displayName: null });
        break;
      }
      default:
        return [];
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (a) =>
        a.email?.toLowerCase().includes(q) ||
        a.displayName?.toLowerCase().includes(q) ||
        a.userId.toLowerCase().includes(q),
    );
  }, [summary?.segments, segmentFilter, segmentUserSet, search]);

  const segmentUserRows = useMemo((): UserSegmentRow[] => {
    const drill = summary?.userDrilldown ?? {};
    return segmentUserAccounts.map((a) => {
      const d = drill[a.userId];
      if (d) {
        return {
          userId: a.userId,
          email: a.email,
          displayName: a.displayName,
          firstBotDate: d.firstBotDate,
          runningDays: d.runningDays,
          runningBots: d.runningBots,
          pausedBots: d.pausedBots,
          exchangeCount: d.exchangeCount,
          capitalUsdt: d.capitalUsdt,
          totalTrades: d.totalTrades,
          netPnlUsdt: d.netPnlUsdt,
        };
      }
      const userDeps = deployments.filter((dep) => dep.userId === a.userId);
      const activeDeps = userDeps.filter((dep) => dep.running);
      const exchanges = new Set(userDeps.map((dep) => dep.exchange));
      const seenWallet = new Set<string>();
      let capital = 0;
      for (const dep of activeDeps) {
        const key = `${dep.userId}::${dep.exchange}`;
        if (seenWallet.has(key)) continue;
        if (dep.wallet?.status === "valid" && dep.wallet.total != null) {
          seenWallet.add(key);
          capital += dep.wallet.total;
        }
      }
      let firstBotDate: string | null = null;
      for (const dep of userDeps) {
        if (dep.firstDeployedAt && (!firstBotDate || dep.firstDeployedAt < firstBotDate)) {
          firstBotDate = dep.firstDeployedAt;
        }
      }
      let runningDays = 0;
      for (const dep of activeDeps) {
        runningDays = Math.max(runningDays, runningDaysFromFirstDeploy(dep.firstDeployedAt));
      }
      const netPnl = userDeps.reduce((sum, dep) => sum + (dep.lifetimeRealizedPnl ?? 0), 0);
      const totalTrades = userDeps.reduce((sum, dep) => sum + (dep.closedTradeCount ?? 0), 0);
      return {
        userId: a.userId,
        email: a.email,
        displayName: a.displayName,
        firstBotDate,
        runningDays,
        runningBots: activeDeps.length,
        pausedBots: userDeps.filter((dep) => dep.deploymentStatus === "paused").length,
        exchangeCount: exchanges.size,
        capitalUsdt: Math.round(capital * 100) / 100,
        totalTrades,
        netPnlUsdt: Math.round(netPnl * 100) / 100,
      };
    });
  }, [segmentUserAccounts, summary?.userDrilldown, deployments]);

  const showUserTable = useMemo(() => {
    if (!segmentFilter) return false;
    const userOnly: BotUsersSegmentFilter[] = [
      "sign_ups",
      "never_deployed",
      "churned",
      "has_bot_now",
      "active_users",
      "paused_users",
      "stopped_users",
      "profitable",
      "new_account",
      "awaiting_profits",
      "no_closed_trades",
      "active_profitable",
      "active_awaiting",
      "active_awaiting_over_30d",
      "paused_profitable",
      "paused_awaiting",
      "exchange_capital_bybit",
      "exchange_capital_coindcx",
      "exchange_capital_hyperliquid",
    ];
    return userOnly.includes(segmentFilter);
  }, [segmentFilter]);

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
  const fallbackMetrics = useMemo((): FlowchartMetrics | null => {
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
    return {
      totalUsers: allUids.size,
      neverDeployed: 0,
      churned: 0,
      hasBotNow: allUids.size,
      activeUsers: activeUids.size,
      pausedUsers: 0,
      stoppedUsers: 0,
      everDeployedInPnl: 0,
      profitableUsers: 0,
      newAccountUsers: 0,
      awaitingProfitsUsers: 0,
      noClosedTradesUsers: 0,
      activeProfitable: 0,
      activeAwaiting: 0,
      activeAwaitingOver30Days: 0,
      pausedProfitable: 0,
      pausedAwaiting: 0,
      totalCapitalUsdt: Math.round(capital * 100) / 100,
      totalVolumeUsdt: 0,
      totalProfitUsdt: Math.round(profit * 100) / 100,
      totalDeployments: deployments.length,
      activeDeployments: deployments.filter((d) => d.running).length,
      exchanges: [],
    };
  }, [summary?.metrics, deployments]);

  const m = summary?.metrics ?? fallbackMetrics ?? undefined;

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
              Lifetime analytics dashboard — click any segment to drill down into users or deployments.
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">
                  Lifetime analytics
                </h2>
                <p className="text-[10px] text-muted-foreground/45 mt-0.5">
                  (date range filters coming soon)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg border border-accent/30 bg-accent/10 text-[10px] font-black uppercase text-accent">
                  Lifetime
                </span>
                {segmentFilter && (
                  <button
                    type="button"
                    onClick={() => setSegmentFilter(null)}
                    className="text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>

            <BotUsersFlowchart
              metrics={m}
              loading={summaryLoading}
              segmentFilter={segmentFilter}
              onSegmentClick={setSegmentFilter}
            />

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
              {showUserTable ? (
                <>
                  <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                    Users in segment
                    {segmentFilter ? ` · ${segmentFilter.replace(/_/g, " ")}` : ""}
                  </div>
                  {user ? (
                    <SegmentUserTable
                      rows={segmentUserRows}
                      deployments={deployments}
                      segmentLabel={segmentFilter ?? undefined}
                      user={user}
                    />
                  ) : null}
                </>
              ) : (
                <>
              <div className="hidden lg:grid grid-cols-[28px_1.2fr_1fr_100px_120px_100px_96px_140px_120px_100px_56px] gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
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
                <span className="text-right inline-flex items-center justify-end gap-1">
                  Pause msg
                  <AdminInfoTip text="Hover a row to read the exact FreedomBot message the user would see on Pause (or why pause is skipped). Profitable rows also include the Delete message." />
                </span>
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
                  const pnlBand = lifetimePnlBand(d.lifetimeRealizedPnl);
                  const pauseRetention = showsPauseRetentionModal(d.lifetimeRealizedPnl);
                  const exchangeLabel = EXCHANGE_LABELS[d.exchange] ?? d.exchange;
                  const pauseHoverText = buildPauseRetentionHoverText({
                    exchangeLabel,
                    runningDays: runningDaysFromFirstDeploy(d.firstDeployedAt),
                    lifetimeRealizedPnl: d.lifetimeRealizedPnl,
                    pnlCurrency: d.pnlCurrency,
                    stats: retentionStatsByExchange[d.exchange] ?? null,
                  });
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
                        className="grid flex-1 min-w-0 grid-cols-1 lg:grid-cols-[28px_1.2fr_1fr_100px_120px_100px_96px_140px_120px_100px] gap-2 px-4 py-3.5 items-start lg:items-center hover:bg-white/[0.03] transition-colors text-left group"
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
                        <RetentionMessagePreviewTip
                          text={pauseHoverText}
                          className="text-right w-full"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-end gap-2 lg:block">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 lg:hidden">
                                Pause msg
                              </span>
                              <span
                                className={cn(
                                  "text-[9px] font-black uppercase tracking-wide underline decoration-dotted decoration-muted-foreground/40 underline-offset-2",
                                  pnlBand === "profitable"
                                    ? "text-emerald-400"
                                    : pnlBand === "drawdown"
                                      ? "text-rose-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {pnlBand === "profitable"
                                  ? "Profitable"
                                  : pnlBand === "drawdown"
                                    ? "Drawdown"
                                    : "Breakeven"}
                              </span>
                            </div>
                            <div
                              className={cn(
                                "text-[10px] font-bold",
                                pauseRetention ? "text-amber-400/90" : "text-muted-foreground/50",
                              )}
                            >
                              {pauseRetention ? "Hover → message" : "Hover → skip + delete"}
                            </div>
                          </div>
                        </RetentionMessagePreviewTip>
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
