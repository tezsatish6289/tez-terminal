"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import { formatSignedUsd } from "@/lib/freedombot/trade-display";
import type { LiveMirrorTrade } from "@/lib/admin/live-mirror-display";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Loader2, ShieldAlert, Users } from "lucide-react";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { MirrorPageKillSwitch } from "@/components/simulator/MirrorPageKillSwitch";

interface ExchangeUser {
  userId: string;
  email: string | null;
  displayName: string | null;
  deploymentId: string | null;
  trades: LiveMirrorTrade[];
}

export function ExchangeMirrorsView({ exchange }: { exchange: string }) {
  const searchParams = useSearchParams();
  const simTradeIdsParam = searchParams.get("simTradeIds") ?? "";
  const simTradeIds = useMemo(
    () =>
      simTradeIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [simTradeIdsParam],
  );

  const { user, isUserLoading } = useUser();
  const isAdmin = isAdminEmail(user?.email);

  const [users, setUsers] = useState<ExchangeUser[]>([]);
  const [analytics, setAnalytics] = useState<{
    userCount: number;
    mirrorCount: number;
    totalUnrealizedPnl: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    const ids = simTradeIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!user || !isAdmin || !exchange || ids.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const q = encodeURIComponent(ids.join(","));
      const res = await fetch(
        `/api/admin/sim-open-trades/exchange/${encodeURIComponent(exchange)}?simTradeIds=${q}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setUsers(data.users ?? []);
      setAnalytics(data.analytics ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setUsers([]);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, exchange, simTradeIdsParam]);

  useEffect(() => {
    if (isUserLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    if (!exchange) {
      setError("Missing exchange");
      setLoading(false);
      return;
    }
    if (simTradeIds.length === 0) {
      setError("Open this page from the simulation Open tab (exchange shortcuts need sim trade context).");
      setLoading(false);
      return;
    }
    void fetchData();
  }, [isUserLoading, isAdmin, exchange, simTradeIdsParam, fetchData]);

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

        <header>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
            Live on exchange
          </p>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">{exchange}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Open mirrors from current sim book · {simTradeIds.length} sim position
            {simTradeIds.length !== 1 ? "s" : ""}
          </p>
          <div className="mt-4">
            <MirrorPageKillSwitch
              simTradeIds={simTradeIds}
              exchangeLabel={exchange}
              onClosed={() => void fetchData()}
            />
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : (
          <>
            {analytics && (
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Users" value={String(analytics.userCount)} />
                <StatCard label="Positions" value={String(analytics.mirrorCount)} />
                <StatCard
                  label="Combined uPnL"
                  value={formatSignedUsd(analytics.totalUnrealizedPnl)}
                  valueClass={
                    analytics.totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }
                />
              </div>
            )}

            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 py-8 text-center">
                No open positions on {exchange} for these sim trades.
              </p>
            ) : (
              <div className="space-y-8">
                {users.map((u) => (
                  <section
                    key={u.userId}
                    className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {u.displayName || u.email || u.userId}
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
                        trades={u.trades}
                        cumulativeByTradeId={new Map()}
                        showWarningBanner={false}
                        emptyTitle="No trades"
                        emptySubtitle=""
                      />
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
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
