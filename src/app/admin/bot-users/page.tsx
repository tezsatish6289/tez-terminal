"use client";

import Link from "next/link";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, ShieldAlert, Search, RefreshCw, Bot, ChevronRight, Trash2 } from "lucide-react";
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

const ADMIN_EMAIL = "hello@tezterminal.com";

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
  lifetimeRealizedPnl: number;
  pnlCurrency: string;
  pnlNote: string;
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
    if (isAdmin) fetchDeployments();
  }, [isAdmin, fetchDeployments]);

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
    if (!search.trim()) return deployments;
    const q = search.toLowerCase();
    return deployments.filter(
      (d) =>
        d.email?.toLowerCase().includes(q) ||
        d.displayName?.toLowerCase().includes(q) ||
        d.userId.toLowerCase().includes(q) ||
        d.deploymentId.toLowerCase().includes(q) ||
        d.botLabel.toLowerCase().includes(q) ||
        d.exchange.toLowerCase().includes(q),
    );
  }, [deployments, search]);

  const stats = useMemo(() => {
    const active = deployments.filter((d) => d.running).length;
    return { total: deployments.length, active };
  }, [deployments]);

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
              One row per deployment. Lifetime realized PnL uses closed live trades (exchange PnL when available).
              Open a row for trade details and execution logs, or delete to require a fresh deploy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchDeployments()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-white/[0.06] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                  Deployments
                </span>
                <span className="text-2xl font-black font-mono text-white">{stats.total}</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                  Active
                </span>
                <span className="text-2xl font-black font-mono text-emerald-400">{stats.active}</span>
              </div>
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
              <div className="hidden lg:grid grid-cols-[28px_1.2fr_1fr_100px_120px_100px_120px_56px] gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                <span />
                <span>User</span>
                <span>Bot</span>
                <span>Exchange</span>
                <span>First deploy</span>
                <span>Status</span>
                <span className="text-right">Lifetime PnL</span>
                <span />
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                  <Bot className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-widest text-white">No deployments</p>
                </div>
              ) : (
                filtered.map((d) => {
                  const pnlColor =
                    d.lifetimeRealizedPnl > 0
                      ? "text-emerald-400"
                      : d.lifetimeRealizedPnl < 0
                        ? "text-rose-400"
                        : "text-muted-foreground";

                  return (
                    <div
                      key={d.deploymentId}
                      className="flex items-stretch border-b border-white/[0.04] last:border-0"
                    >
                      <Link
                        href={`/admin/bot-users/${d.deploymentId}`}
                        className="grid flex-1 min-w-0 grid-cols-1 lg:grid-cols-[28px_1.2fr_1fr_100px_120px_100px_120px] gap-2 px-4 py-3.5 items-start lg:items-center hover:bg-white/[0.03] transition-colors text-left group"
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
    </div>
  );
}
