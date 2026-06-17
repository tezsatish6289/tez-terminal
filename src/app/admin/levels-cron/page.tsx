"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { DhanFnoMapPanel } from "@/components/admin/DhanFnoMapPanel";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import type {
  LevelsCronDashboardPayload,
  LevelsCronStockRow,
} from "@/lib/levels/levels-cron-dashboard";
import type { CronHealthLevel } from "@/lib/cron-health-shared";
import { formatIstDateTime } from "@/lib/ist-display";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function levelTone(level: CronHealthLevel): string {
  switch (level) {
    case "critical":
      return "text-rose-400";
    case "warn":
      return "text-amber-400";
    case "unknown":
      return "text-slate-400";
    default:
      return "text-emerald-400";
  }
}

function levelBg(level: CronHealthLevel): string {
  switch (level) {
    case "critical":
      return "border-rose-500/40 bg-rose-950/30";
    case "warn":
      return "border-amber-500/35 bg-amber-950/20";
    case "unknown":
      return "border-slate-500/30 bg-slate-900/40";
    default:
      return "border-emerald-500/30 bg-emerald-950/20";
  }
}

function CronStatusCard({
  title,
  level,
  heartbeat,
  staleMs,
  intervalMs,
}: {
  title: string;
  level: CronHealthLevel;
  heartbeat: LevelsCronDashboardPayload["stockCron"]["heartbeat"];
  staleMs: number | null;
  intervalMs?: number;
}) {
  return (
    <div className={`rounded-xl border p-4 ${levelBg(level)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <p className={`text-lg font-black mt-1 capitalize ${levelTone(level)}`}>
            {level}
          </p>
        </div>
        {level === "ok" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
        )}
      </div>
      <dl className="mt-3 space-y-1.5 text-[11px] text-slate-400">
        <div className="flex justify-between gap-4">
          <dt>Last attempt</dt>
          <dd className="text-slate-200 tabular-nums">{formatIstDateTime(heartbeat.lastAttemptAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Last success</dt>
          <dd className="text-slate-200 tabular-nums">
            {heartbeat.lastSuccessAt
              ? `${formatDistanceToNowStrict(new Date(heartbeat.lastSuccessAt))} ago`
              : "never"}
          </dd>
        </div>
        {staleMs != null && level !== "ok" ? (
          <div className="flex justify-between gap-4">
            <dt>Stale</dt>
            <dd className="text-rose-300">{Math.round(staleMs / 60_000)}m</dd>
          </div>
        ) : null}
        {intervalMs ? (
          <div className="flex justify-between gap-4">
            <dt>Schedule</dt>
            <dd>every {Math.round(intervalMs / 60_000)}m</dd>
          </div>
        ) : null}
        {heartbeat.lastDurationMs != null ? (
          <div className="flex justify-between gap-4">
            <dt>Last duration</dt>
            <dd>{(heartbeat.lastDurationMs / 1000).toFixed(1)}s</dd>
          </div>
        ) : null}
        {heartbeat.consecutiveFailures > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>Fail streak</dt>
            <dd className="text-rose-300">{heartbeat.consecutiveFailures}</dd>
          </div>
        ) : null}
      </dl>
      {heartbeat.lastSummary ? (
        <p className="mt-3 text-[10px] font-mono text-slate-300/90 break-all leading-relaxed">
          {heartbeat.lastSummary}
        </p>
      ) : null}
      {heartbeat.lastError ? (
        <p className="mt-2 text-[10px] text-rose-300/90 break-all">{heartbeat.lastError}</p>
      ) : null}
    </div>
  );
}

function StockTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: LevelsCronStockRow[];
  empty: string;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
    >
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-slate-500 border-b border-white/[0.06]">
                <th className="px-4 py-2 font-semibold">Symbol</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Spot</th>
                <th className="px-4 py-2 font-semibold">Scanned</th>
                <th className="px-4 py-2 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-bold text-slate-200">{r.symbol}</td>
                  <td className="px-4 py-2 text-slate-400">{r.status}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-300">
                    {r.spot != null ? `₹${r.spot.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-400">
                    {formatIstDateTime(r.computedAt)}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-500">
                    {r.ageHours != null ? `${r.ageHours}h` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LevelsCronDashboardPage() {
  const { user, isUserLoading: authLoading } = useUser();
  const [data, setData] = useState<LevelsCronDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = isAdminEmail(user?.email);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/levels-cron-dashboard", {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as LevelsCronDashboardPayload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin) void fetchData();
  }, [isAdmin, fetchData]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(id);
  }, [isAdmin, fetchData]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <TopBar />
        <main className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Admin access required.</p>
        </main>
      </div>
    );
  }

  const maxDayCount = Math.max(1, ...(data?.scansByDayIst.map((d) => d.count) ?? [1]));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-accent">
                <Gauge className="h-5 w-5" />
                <h1 className="text-xl font-black tracking-tight text-white">
                  Level Cron Dashboard
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                NSE F&O stock zone cron only (not crypto). Throughput, circuit state, and freshness
                for{" "}
                <Link href="https://fnoninja.com/levels" className="text-accent hover:underline">
                  fnoninja.com/levels
                </Link>{" "}
                stock aggregate data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          {!data && loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
            </div>
          ) : null}

          {data ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <AdminStatCard
                  label="Scanned today (IST)"
                  value={String(data.freshness.scannedTodayIst)}
                  sublabel={`${data.todayIst} · target ~${data.runtime.expectedScansPerHour}/hr in market hours`}
                  valueClassName={
                    data.freshness.scannedTodayIst > 0 ? "text-emerald-400" : "text-amber-400"
                  }
                />
                <AdminStatCard
                  label="In aggregate"
                  value={`${data.universe.inAggregate}/${data.universe.fnoTotal}`}
                  sublabel={
                    data.universe.neverScanned > 0
                      ? `${data.universe.neverScanned} never scanned`
                      : "Full universe covered"
                  }
                />
                <AdminStatCard
                  label="Stale &gt; 24h"
                  value={String(data.freshness.staleOver24h)}
                  sublabel={`${data.freshness.staleOver7d} older than 7d`}
                  valueClassName={
                    data.freshness.staleOver24h > 50 ? "text-amber-400" : "text-white"
                  }
                />
                <AdminStatCard
                  label="In zone now"
                  value={String(data.freshness.inZoneCount)}
                  sublabel="Geographic (at/near bands)"
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <CronStatusCard
                  title="F&O stock zones cron"
                  level={data.stockCron.level}
                  heartbeat={data.stockCron.heartbeat}
                  staleMs={data.stockCron.staleMs}
                  intervalMs={data.stockCron.expectedIntervalMs}
                />
                <CronStatusCard
                  title="Crypto zones cron (separate)"
                  level={data.indexCron.level}
                  heartbeat={data.indexCron.heartbeat}
                  staleMs={data.indexCron.staleMs}
                  intervalMs={15 * 60_000}
                />
              </div>
              <p className="text-[10px] text-slate-500 -mt-2">
                Right card is Deribit BTC/ETH/SOL only — unrelated to F&O stock scanning on the left.
              </p>

              <DhanFnoMapPanel />

              {data.recentBatchErrors.length > 0 ? (
                <div
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Last batch errors
                  </h3>
                  <ul className="space-y-1.5 text-[11px]">
                    {data.recentBatchErrors.map((row) => (
                      <li key={row.symbol} className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-bold text-slate-200">{row.symbol}</span>
                        <span className="text-rose-300/90 font-mono break-all">
                          {row.error ?? "no error stored"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {data.nseBreaker.open ? (
                    <p className="mt-2 text-[10px] text-amber-300/90">
                      NSE circuit is open — stock cron runs Dhan-only and skips the backlog.
                      Stale Dhan security IDs (Invalid SecurityId) are skipped; backlog names wait
                      for NSE recovery.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid lg:grid-cols-3 gap-4">
                <div
                  className="rounded-xl border p-4 lg:col-span-1"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="h-4 w-4 text-slate-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Infrastructure
                    </h3>
                  </div>
                  <dl className="space-y-2 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Batch size</dt>
                      <dd className="text-slate-200 font-mono">{data.runtime.batchSize}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Wall clock cap</dt>
                      <dd className="text-slate-200 font-mono">
                        {(data.runtime.maxRunMs / 1000).toFixed(0)}s
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Symbol timeout</dt>
                      <dd className="text-slate-200 font-mono">
                        {(data.runtime.symbolTimeoutMs / 1000).toFixed(0)}s
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Market window</dt>
                      <dd className="text-slate-200">{data.runtime.marketWindowIst}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Queue mode</dt>
                      <dd className="text-slate-200 capitalize">
                        {data.effectiveQueueMode
                          ? `${data.queueMode} → ${data.effectiveQueueMode} (dhan)`
                          : data.queueMode}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Cursor</dt>
                      <dd className="text-slate-200 font-mono">{data.cursorIndex}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Run lock</dt>
                      <dd className={data.runLock.active ? "text-amber-400" : "text-emerald-400"}>
                        {data.runLock.active ? "active" : "free"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">NSE circuit</dt>
                      <dd className={data.nseBreaker.open ? "text-rose-400" : "text-emerald-400"}>
                        {data.nseBreaker.open ? "OPEN (Dhan only)" : "closed"}
                      </dd>
                    </div>
                  </dl>
                  {data.nextBatchPreview.length > 0 ? (
                    <p className="mt-3 text-[10px] text-slate-400">
                      <span className="text-slate-500">Next batch: </span>
                      <span className="font-mono text-slate-200">
                        {data.nextBatchPreview.join(", ")}
                      </span>
                    </p>
                  ) : null}
                  {data.nseBreaker.open && data.nseBreaker.lastError ? (
                    <p className="mt-2 text-[10px] text-rose-300/80 break-all">
                      {data.nseBreaker.lastError}
                    </p>
                  ) : null}
                </div>

                <div
                  className="rounded-xl border p-4 lg:col-span-2"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Scans by day (IST)
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {data.scansByDayIst.map((d) => (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-500 w-24 shrink-0">
                          {d.date}
                        </span>
                        <div className="flex-1 h-5 rounded bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full rounded bg-blue-500/50 min-w-[2px]"
                            style={{ width: `${(d.count / maxDayCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-slate-300 w-8 text-right">
                          {d.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
              >
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  NSE index zones (Nifty, Bank Nifty, …)
                </h3>
                <p className="text-[10px] text-slate-500 mb-3">
                  Refreshed by the F&O stock cron when the oldest index is older than{" "}
                  {data.indexZonesMeta.staleThresholdMinutes} min (Mon–Fri 9:00–16:00 IST).
                  {data.indexZonesMeta.anyStale ? (
                    <span className="text-amber-300/90">
                      {" "}
                      Oldest: {data.indexZonesMeta.oldestAgeHours ?? "—"}h — next stock tick
                      should refresh.
                    </span>
                  ) : (
                    <span className="text-emerald-400/90"> All indices within threshold.</span>
                  )}
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  {data.indices.map((ix) => (
                    <div
                      key={ix.symbol}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <p className="text-[10px] font-bold text-slate-300">{ix.symbol}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{formatIstDateTime(ix.computedAt)}</p>
                      <p className="text-[9px] text-slate-500 tabular-nums">
                        {ix.ageHours != null ? `${ix.ageHours}h old` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <StockTable
                  title={`Scanned today (${data.scannedToday.length})`}
                  rows={data.scannedToday}
                  empty="No successful aggregate refreshes yet today."
                />
                <StockTable
                  title="Oldest in queue (next refresh candidates)"
                  rows={data.oldestStale}
                  empty="No aggregate entries."
                />
              </div>

              {data.universe.neverScannedSymbols.length > 0 ? (
                <div
                  className="rounded-xl border px-4 py-3 text-[11px] text-slate-400"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.4)" }}
                >
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                    Never scanned ({data.universe.neverScanned})
                  </span>
                  <p className="mt-2 font-mono text-slate-300 leading-relaxed">
                    {data.universe.neverScannedSymbols.join(", ")}
                    {data.universe.neverScanned > 20 ? " …" : ""}
                  </p>
                </div>
              ) : null}

              <p className="text-[10px] text-slate-600 text-center pb-4">
                Auto-refreshes every 30s · Last fetch {formatIstDateTime(data.fetchedAt)}
              </p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
