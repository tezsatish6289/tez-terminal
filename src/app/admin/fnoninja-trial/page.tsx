"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Flame, Gem, Loader2, Snowflake, Target, RefreshCw, ShieldAlert } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { TRIAL_ACTIVATION_DEFINITION } from "@/lib/fnoninja/trial-activity-types";
import type { TrialInsightsPayload, TrialInsightUser } from "@/lib/fnoninja/trial-insights-types";

const MILESTONE_CHIPS: { key: keyof TrialInsightUser["milestones"]; label: string }[] = [
  { key: "map_opened", label: "Map" },
  { key: "chart_opened", label: "Chart" },
  { key: "favslide_added", label: "Watchlist" },
  { key: "alerts_enabled", label: "Alerts" },
  { key: "liveslide_opened", label: "Livelist" },
  { key: "atlas_opened", label: "Atlas" },
  { key: "subscribe_viewed", label: "Pricing" },
  { key: "payment_initiated", label: "Checkout" },
];

const FNO_EXPERIENCE_SHORT: Record<string, string> = {
  never: "never",
  lt_1y: "<1y",
  "1_3y": "1–3y",
  "3_5y": "3–5y",
  gt_5y: "5y+",
};

function UserRow({ u }: { u: TrialInsightUser }) {
  const personaLabel = u.fnoExperience
    ? FNO_EXPERIENCE_SHORT[u.fnoExperience] ?? u.fnoExperience
    : null;

  return (
    <div className="grid grid-cols-[1.4fr_90px_100px_90px_1fr] gap-2 px-4 py-3 border-b border-white/[0.04] text-sm">
      <div className="min-w-0">
        <div className="font-semibold text-white truncate">{u.displayName || "—"}</div>
        <div className="text-[11px] text-muted-foreground truncate">{u.email || u.uid}</div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {u.lastSeenAt ? format(new Date(u.lastSeenAt), "MMM dd, HH:mm") : "—"}
      </div>
      <div className="text-[11px]">
        <span className={u.activated ? "text-emerald-400" : "text-muted-foreground"}>
          {u.activated ? "Activated" : "Not yet"}
        </span>
        <div className="text-muted-foreground/60">{u.sessionCount} sess</div>
      </div>
      <div className="text-[11px] font-mono">
        {u.diamondsLifetimeEarned > 0 ? (
          <>
            <div className="text-sky-300">{u.diamondsLifetimeEarned}◆</div>
            <div className="text-muted-foreground/60">
              {u.rewardsDaysExtended > 0 ? `+${u.rewardsDaysExtended}d` : `${u.diamonds} bal`}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 content-start">
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${
            personaLabel
              ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
              : "border-white/5 bg-white/[0.02] text-muted-foreground/40"
          }`}
          title={u.fnoExperience ? `F&O experience: ${u.fnoExperience}` : "Persona not answered"}
        >
          {personaLabel ? `FO ${personaLabel}` : "Persona"}
        </span>
        {MILESTONE_CHIPS.map(({ key, label }) => {
          const on = Boolean(u.milestones[key]);
          return (
            <span
              key={key}
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${
                on
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/5 bg-white/[0.02] text-muted-foreground/40"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminFnoNinjaTrialPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = isAdminEmail(user?.email);
  const [data, setData] = useState<TrialInsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/fnoninja-trial-insights", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json as TrialInsightsPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

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

  const funnel = data?.funnel;
  const rewards = data?.rewards;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-accent" />
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
                Trial Insights
              </h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Activation = <code className="text-accent/90 text-xs">{TRIAL_ACTIVATION_DEFINITION}</code>
              . Review funnel weekly, call 5 users, ship one conversion change.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.06]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : funnel ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: "Trials started", value: funnel.started },
                { label: "Activated", value: funnel.activated, sub: `${funnel.activationRatePct}%` },
                { label: "Returned D2+", value: funnel.returnedD2 },
                { label: "Saw pricing", value: funnel.subscribeViewed },
                { label: "Checkout started", value: funnel.paymentInitiated },
                { label: "Paid", value: funnel.paid, sub: `${funnel.paidFromTrialPct}% of trials` },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4"
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                    {c.label}
                  </span>
                  <span className="text-2xl font-black font-mono text-white">{c.value}</span>
                  {"sub" in c && c.sub ? (
                    <span className="mt-0.5 block text-[10px] font-mono text-muted-foreground/60">
                      {c.sub}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {rewards ? (
              <section className="rounded-xl border border-sky-500/20 bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-sky-400/80">
                  <Gem className="h-3.5 w-3.5" />
                  Rewards (trials)
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
                  {[
                    { label: "Persona answered", value: rewards.personaAnswered },
                    { label: "Earned any diamonds", value: rewards.earnedAny },
                    { label: "Lifetime diamonds", value: rewards.totalLifetimeDiamonds },
                    { label: "Days extended", value: rewards.totalDaysExtended },
                    {
                      label: "Earned → paid",
                      value: rewards.earnedThenPaid,
                      sub: `${rewards.earnedThenPaidRatePct}% of earners`,
                    },
                  ].map((c) => (
                    <div key={c.label}>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                        {c.label}
                      </span>
                      <span className="text-xl font-black font-mono text-white">{c.value}</span>
                      {"sub" in c && c.sub ? (
                        <span className="mt-0.5 block text-[10px] font-mono text-muted-foreground/60">
                          {c.sub}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                Conversion drivers (milestone → paid rate)
              </div>
              <div className="divide-y divide-white/[0.04]">
                {(data?.drivers ?? []).map((d) => (
                  <div
                    key={d.milestone}
                    className="grid grid-cols-[1fr_80px_80px_80px] gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="text-white/90">{d.label}</span>
                    <span className="font-mono text-muted-foreground">{d.withMilestone}</span>
                    <span className="font-mono text-emerald-400">{d.converted}</span>
                    <span className="font-mono text-amber-300">{d.convertRatePct}%</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid lg:grid-cols-2 gap-4">
              <section className="rounded-xl border border-amber-500/20 bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-amber-400/80">
                  <Flame className="h-3.5 w-3.5" />
                  Hot trials ({data?.hotTrials.length ?? 0})
                </div>
                {(data?.hotTrials.length ?? 0) === 0 ? (
                  <p className="px-4 py-8 text-xs text-muted-foreground text-center">
                    No hot trials yet — need activity + alerts/watchlist/Atlas.
                  </p>
                ) : (
                  data!.hotTrials.map((u) => <UserRow key={u.uid} u={u} />)
                )}
              </section>

              <section className="rounded-xl border border-sky-500/20 bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-sky-400/80">
                  <Snowflake className="h-3.5 w-3.5" />
                  Cold trials ({data?.coldTrials.length ?? 0})
                </div>
                {(data?.coldTrials.length ?? 0) === 0 ? (
                  <p className="px-4 py-8 text-xs text-muted-foreground text-center">
                    No cold trials matching the age + inactivity rules.
                  </p>
                ) : (
                  data!.coldTrials.map((u) => <UserRow key={u.uid} u={u} />)
                )}
              </section>
            </div>

            <section className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                All FNONINJA users — milestones ({data?.users.length ?? 0})
              </div>
              <div className="grid grid-cols-[1.4fr_90px_100px_90px_1fr] gap-2 px-4 py-2 border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-muted-foreground/40">
                <span>User</span>
                <span>Last seen</span>
                <span>Activation</span>
                <span>Rewards</span>
                <span>Milestones</span>
              </div>
              {(data?.users ?? []).slice(0, 100).map((u) => (
                <UserRow key={u.uid} u={u} />
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
