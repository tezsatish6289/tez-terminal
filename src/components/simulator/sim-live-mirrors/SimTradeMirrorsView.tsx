"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import { formatSignedUsd } from "@/lib/freedombot/trade-display";
import type { LiveMirrorTrade } from "@/lib/admin/live-mirror-display";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Loader2, ShieldAlert, Users } from "lucide-react";
import { format } from "date-fns";
import type { SimTrade } from "@/lib/simulator";

const ADMIN_EMAIL = "hello@tezterminal.com";

interface Analytics {
  userCount: number;
  mirrorCount: number;
  totalUnrealizedPnl: number;
  exchangeCount: number;
  byExchange: Array<{ exchange: string; count: number }>;
}

export function SimTradeMirrorsView({ simTradeId }: { simTradeId: string }) {
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [simTrade, setSimTrade] = useState<SimTrade | null>(null);
  const [mirrors, setMirrors] = useState<LiveMirrorTrade[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!user || !isAdmin || !simTradeId) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/sim-open-trades/${encodeURIComponent(simTradeId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setSimTrade(data.simTrade as SimTrade);
      setMirrors(data.mirrors ?? []);
      setAnalytics(data.analytics ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setSimTrade(null);
      setMirrors([]);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, simTradeId]);

  useEffect(() => {
    if (isUserLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    if (!simTradeId) {
      setError("Missing trade id");
      setLoading(false);
      return;
    }
    void fetchData();
  }, [isUserLoading, isAdmin, simTradeId, fetchData]);

  const mirrorsByUser = useMemo(() => {
    const map = new Map<string, LiveMirrorTrade[]>();
    for (const m of mirrors) {
      const list = map.get(m.userId) ?? [];
      list.push(m);
      map.set(m.userId, list);
    }
    return [...map.entries()].sort((a, b) =>
      (a[1][0]?.displayName ?? a[1][0]?.email ?? a[0]).localeCompare(
        b[1][0]?.displayName ?? b[1][0]?.email ?? b[0],
      ),
    );
  }, [mirrors]);

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
        <Card className="max-w-md w-full border-accent/20 bg-card">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>Admin only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Link
          href="/simulation"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to simulation
        </Link>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : simTrade ? (
          <>
            <header className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                Live mirrors · sim position
              </p>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">
                {simTrade.symbol}{" "}
                <span
                  className={cn(
                    "text-base",
                    simTrade.side === "BUY" ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {simTrade.side}
                </span>
              </h1>
              <p className="text-sm text-muted-foreground">
                Paper sim entry ${simTrade.entryPrice?.toLocaleString()} · opened{" "}
                {simTrade.openedAt
                  ? format(new Date(simTrade.openedAt), "MMM d, yyyy h:mm a")
                  : "—"}
              </p>
            </header>

            {analytics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Users" value={String(analytics.userCount)} />
                <StatCard label="Live positions" value={String(analytics.mirrorCount)} />
                <StatCard
                  label="Combined uPnL"
                  value={formatSignedUsd(analytics.totalUnrealizedPnl)}
                  valueClass={
                    analytics.totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }
                />
                <StatCard label="Exchanges" value={String(analytics.exchangeCount)} />
              </div>
            )}

            {mirrors.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 py-8 text-center">
                No live mirrored positions on any exchange for this sim trade.
              </p>
            ) : (
              <div className="space-y-8">
                {mirrorsByUser.map(([userId, userTrades]) => {
                  const u = userTrades[0]!;
                  return (
                    <section
                      key={userId}
                      className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2 min-w-0">
                          <Users className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {u.displayName || u.email || userId}
                            </p>
                            {u.email && u.displayName && (
                              <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                            )}
                          </div>
                        </div>
                        {u.deploymentId && (
                          <Link
                            href={`/admin/bot-users/${u.deploymentId}`}
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-accent hover:underline shrink-0"
                          >
                            Bot detail <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <div className="p-2">
                        <TradesPanel
                          trades={userTrades}
                          cumulativeByTradeId={new Map()}
                          showWarningBanner={false}
                          emptyTitle="No trades"
                          emptySubtitle=""
                        />
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground/50 py-8 text-center">Trade not found.</p>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      <p className={cn("text-xl font-black font-mono mt-1", valueClass)}>{value}</p>
    </div>
  );
}
