"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useUser } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import {
  CRON_JOBS,
  type CronJobId,
  type CronHeartbeatDoc,
  type CronHealthLevel,
} from "@/lib/cron-health-shared";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const ADMIN_EMAIL = "hello@tezterminal.com";

function formatStale(staleMs: number | null): string {
  if (staleMs == null) return "no successful run yet";
  const mins = Math.round(staleMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 90) return `${mins}m since last OK`;
  return `${Math.round(mins / 60)}h since last OK`;
}

function levelStyles(level: CronHealthLevel): string {
  switch (level) {
    case "critical":
      return "border-rose-500/50 bg-rose-500/10 text-rose-200 animate-pulse";
    case "warn":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "unknown":
      return "border-white/10 bg-white/[0.03] text-muted-foreground";
    default:
      return "border-emerald-500/25 bg-emerald-500/5 text-emerald-200/90";
  }
}

type JobView = {
  job: (typeof CRON_JOBS)[CronJobId];
  doc: CronHeartbeatDoc;
  level: CronHealthLevel;
  staleMs: number | null;
};

/** Ops banner — admin only; loads via Admin API (not client Firestore). */
export function CronHealthBanner() {
  const { user } = useUser();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [views, setViews] = useState<JobView[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!user || !isAdmin) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/cron-health", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setViews(data.jobs ?? []);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Failed to load cron health");
      setViews(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (isAdmin && user) void fetchHealth();
  }, [isAdmin, user, fetchHealth]);

  useAutoRefresh(isAdmin ? [fetchHealth] : [], 60_000);

  const worst = useMemo(() => {
    if (!views?.length) return "ok" as CronHealthLevel;
    return views.reduce<CronHealthLevel>((acc, v) => {
      const rank: Record<CronHealthLevel, number> = {
        ok: 0,
        unknown: 1,
        warn: 2,
        critical: 3,
      };
      return rank[v.level] > rank[acc] ? v.level : acc;
    }, "ok");
  }, [views]);

  if (!isAdmin) return null;

  const anyBad = worst === "warn" || worst === "critical";

  if (isLoading && !views?.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking cron health…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[10px] text-amber-200">
        Cron health unavailable: {fetchError}
      </div>
    );
  }

  if (!views?.length) return null;

  return (
    <div className={cn("rounded-xl border px-3 py-2.5 space-y-2", levelStyles(worst))}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {anyBad ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span className="text-[10px] font-black uppercase tracking-widest">
            Cron health {anyBad ? "— attention" : "— OK"}
          </span>
        </div>
        <span className="text-[9px] font-mono opacity-70">
          refreshes every 60s · Telegram every 5m while critical
        </span>
      </div>
      <div className="grid gap-1 sm:grid-cols-3">
        {views.map(({ job, doc, level, staleMs }) => (
          <div
            key={job.id}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-[10px]",
              level === "critical"
                ? "border-rose-500/30 bg-rose-500/5"
                : level === "warn"
                  ? "border-amber-500/25 bg-amber-500/5"
                  : "border-white/[0.06] bg-black/20",
            )}
          >
            <div className="font-bold uppercase tracking-wide">{job.label}</div>
            <div className="font-mono text-[9px] opacity-80 mt-0.5">
              {level.toUpperCase()} · {formatStale(staleMs)}
            </div>
            {doc.lastSummary ? (
              <div className="text-[9px] opacity-60 truncate mt-0.5" title={doc.lastSummary}>
                {doc.lastSummary}
              </div>
            ) : null}
            {doc.lastError && (level === "critical" || level === "warn") ? (
              <div
                className="text-[9px] text-rose-300/90 mt-0.5 line-clamp-2"
                title={doc.lastError}
              >
                {doc.lastError}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
