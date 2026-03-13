"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Users,
  Send,
  Gift,
  CreditCard,
  Clock,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";

interface UserData {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  subscription: {
    status: string;
    daysLeft: number;
    endDate: string | null;
  };
  telegram: {
    connected: boolean;
    enabled: boolean;
    username: string | null;
    connectedAt: string | null;
    preferences: any | null;
  };
  referral: {
    code: string | null;
    referredCount: number;
    totalEarned: number;
    paid: number;
    pending: number;
    walletAddress: string | null;
  };
  revenue: {
    totalPaid: number;
    paymentCount: number;
  };
}

function SubBadge({ status, daysLeft }: { status: string; daysLeft: number }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    trial: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Trial" },
    active: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Active" },
    expired: { bg: "bg-rose-500/15", text: "text-rose-400", label: "Expired" },
    none: { bg: "bg-white/5", text: "text-muted-foreground/50", label: "None" },
  };
  const c = config[status] || config.none;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase", c.bg, c.text)}>
      {c.label}
      {daysLeft > 0 && status !== "expired" && (
        <span className="text-[8px] opacity-70">· {daysLeft}d</span>
      )}
    </span>
  );
}

function TelegramBadge({ telegram }: { telegram: UserData["telegram"] }) {
  if (!telegram.connected) {
    return <span className="text-[10px] text-muted-foreground/40">Not connected</span>;
  }

  const prefSummary = telegram.preferences
    ? Object.entries(telegram.preferences)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(", ")
    : null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-default",
            telegram.enabled ? "bg-blue-500/15 text-blue-400" : "bg-white/5 text-muted-foreground/50"
          )}>
            <Send className="h-2.5 w-2.5" />
            {telegram.enabled ? "Active" : "Paused"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed font-normal p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Username</span>
            <span className="font-mono font-bold">@{telegram.username || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connected</span>
            <span className="font-mono">{telegram.connectedAt ? format(new Date(telegram.connectedAt), "MMM dd, yyyy") : "—"}</span>
          </div>
          {prefSummary && (
            <div className="pt-1 border-t border-white/10">
              <span className="text-muted-foreground block mb-0.5">Preferences</span>
              <span className="font-mono text-[10px] text-white/70">{prefSummary || "Default"}</span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ExpandedRow({ user }: { user: UserData }) {
  return (
    <div className="px-6 py-4 bg-white/[0.01] border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Subscription details */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          <CreditCard className="h-3 w-3" /> Subscription
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <SubBadge status={user.subscription.status} daysLeft={user.subscription.daysLeft} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">End Date</span>
            <span className="font-mono text-white/60">
              {user.subscription.endDate ? format(new Date(user.subscription.endDate), "MMM dd, yyyy") : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="font-mono font-bold text-white">${user.revenue.totalPaid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payments</span>
            <span className="font-mono text-white/60">{user.revenue.paymentCount}</span>
          </div>
        </div>
      </div>

      {/* Telegram details */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          <Send className="h-3 w-3" /> Telegram
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Connected</span>
            <span className={cn("font-bold", user.telegram.connected ? "text-emerald-400" : "text-rose-400")}>
              {user.telegram.connected ? "Yes" : "No"}
            </span>
          </div>
          {user.telegram.connected && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono text-white/60">@{user.telegram.username || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alerts</span>
                <span className={cn("font-bold", user.telegram.enabled ? "text-emerald-400" : "text-amber-400")}>
                  {user.telegram.enabled ? "Enabled" : "Paused"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connected At</span>
                <span className="font-mono text-white/60">
                  {user.telegram.connectedAt ? format(new Date(user.telegram.connectedAt), "MMM dd, yyyy") : "—"}
                </span>
              </div>
            </>
          )}
          {user.telegram.preferences && (
            <div className="pt-1 border-t border-white/[0.06]">
              <span className="text-muted-foreground text-[10px]">Preferences:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(user.telegram.preferences)
                  .filter(([, v]) => v === true)
                  .map(([k]) => (
                    <span key={k} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold">
                      {k}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Referral details */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          <Gift className="h-3 w-3" /> Referrals
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Referral Code</span>
            <span className="font-mono font-bold text-accent">{user.referral.code || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Referred Users</span>
            <span className="font-mono font-bold text-white">{user.referral.referredCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Earned</span>
            <span className="font-mono font-bold text-emerald-400">${user.referral.totalEarned.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-mono text-emerald-400/70">${user.referral.paid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-mono text-amber-400">${user.referral.pending.toFixed(2)}</span>
          </div>
          {user.referral.walletAddress && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wallet</span>
              <span className="font-mono text-[10px] text-white/40 truncate max-w-[120px]">{user.referral.walletAddress}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === "hello@tezterminal.com";

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAdmin]);

  const toggleExpand = (uid: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.referral.code?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const total = users.length;
    const telegramConnected = users.filter((u) => u.telegram.connected).length;
    const activeSubs = users.filter((u) => u.subscription.status === "active" || u.subscription.status === "trial").length;
    const totalRevenue = users.reduce((s, u) => s + u.revenue.totalPaid, 0);
    return { total, telegramConnected, activeSubs, totalRevenue };
  }, [users]);

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
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" />
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Users</h1>
          </div>
          <p className="text-muted-foreground text-sm">User analytics and engagement overview.</p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Total Users</span>
                <span className="text-2xl font-black font-mono text-white">{stats.total}</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Active Subs</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{stats.activeSubs}</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Telegram</span>
                <span className="text-2xl font-black font-mono text-blue-400">{stats.telegramConnected}</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Total Revenue</span>
                <span className="text-2xl font-black font-mono text-emerald-400">${stats.totalRevenue.toFixed(2)}</span>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search by name, email, or referral code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/30"
              />
            </div>

            {/* Users table */}
            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_100px_100px_80px_80px_80px_100px] gap-2 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 hidden lg:grid">
                <span>Name</span>
                <span>Email</span>
                <span>Subscription</span>
                <span>Telegram</span>
                <span>Referred</span>
                <span>Revenue</span>
                <span>Ref Code</span>
                <span className="text-right">Last Active</span>
              </div>

              {/* Rows */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                  <Users className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-widest text-white">No Users Found</p>
                </div>
              ) : (
                filtered.map((u) => {
                  const isExpanded = expandedIds.has(u.uid);
                  return (
                    <div key={u.uid} className="border-b border-white/[0.04] last:border-0">
                      {/* Desktop row */}
                      <button
                        onClick={() => toggleExpand(u.uid)}
                        className="hidden lg:grid grid-cols-[1fr_1fr_100px_100px_80px_80px_80px_100px] gap-2 w-full px-6 py-3.5 items-center hover:bg-white/[0.03] transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-accent shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          )}
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="h-6 w-6 rounded-full shrink-0" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-accent">
                                {(u.displayName || u.email || "?")[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="text-sm font-bold text-white truncate">{u.displayName || "—"}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">{u.email || "—"}</span>
                        <span><SubBadge status={u.subscription.status} daysLeft={u.subscription.daysLeft} /></span>
                        <span><TelegramBadge telegram={u.telegram} /></span>
                        <span className="text-[11px] font-mono font-bold text-white/60">{u.referral.referredCount}</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">${u.revenue.totalPaid.toFixed(2)}</span>
                        <span className="text-[10px] font-mono text-accent/70">{u.referral.code || "—"}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/40 text-right">
                          {u.lastSeenAt ? format(new Date(u.lastSeenAt), "MMM dd, HH:mm") : "—"}
                        </span>
                      </button>

                      {/* Mobile row */}
                      <button
                        onClick={() => toggleExpand(u.uid)}
                        className="lg:hidden w-full px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-accent shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                            )}
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="h-7 w-7 rounded-full shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-bold text-accent">
                                  {(u.displayName || u.email || "?")[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-white block truncate">{u.displayName || "—"}</span>
                              <span className="text-[10px] text-muted-foreground/50 block truncate">{u.email || "—"}</span>
                            </div>
                          </div>
                          <SubBadge status={u.subscription.status} daysLeft={u.subscription.daysLeft} />
                        </div>
                        <div className="flex items-center gap-3 mt-2 ml-9 text-[10px]">
                          <TelegramBadge telegram={u.telegram} />
                          {u.referral.referredCount > 0 && (
                            <span className="text-muted-foreground/40">{u.referral.referredCount} referred</span>
                          )}
                          {u.revenue.totalPaid > 0 && (
                            <span className="text-emerald-400/70 font-mono font-bold">${u.revenue.totalPaid.toFixed(2)}</span>
                          )}
                          <span className="text-muted-foreground/30 font-mono ml-auto">
                            {u.lastSeenAt ? format(new Date(u.lastSeenAt), "MMM dd") : "—"}
                          </span>
                        </div>
                      </button>

                      {isExpanded && <ExpandedRow user={u} />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-center text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest py-2">
              {filtered.length} of {users.length} users
            </div>
          </>
        )}
      </main>
    </div>
  );
}
