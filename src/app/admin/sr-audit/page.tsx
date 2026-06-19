"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SrStoryReplay, type StoryReplayData } from "@/components/admin/SrStoryReplay";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { srCloseComment } from "@/lib/sr-audit/pnl";
import type { SrAuditSummary, SrZoneEvent } from "@/lib/sr-audit/types";
import { format } from "date-fns";
import {
  Activity,
  DatabaseZap,
  Download,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SrEventRow = SrZoneEvent & { id?: string };

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function StatCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "green" | "red" | "neutral";
}) {
  const color =
    tone === "green" ? "#86efac" : tone === "red" ? "#fca5a5" : "#e2e8f0";
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.6)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="text-2xl font-black mt-1 tabular-nums" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="text-[10px] text-slate-500 mt-1">{sub}</p> : null}
    </div>
  );
}

export default function SrAuditAdminPage() {
  const { user, isUserLoading: authLoading } = useUser();
  const [summary, setSummary] = useState<SrAuditSummary | null>(null);
  const [events, setEvents] = useState<SrEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sideFilter, setSideFilter] = useState<"" | "support" | "resistance">("");
  const [stateFilter, setStateFilter] = useState<"" | "open" | "resolved">("");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [notice, setNotice] = useState("");
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayData, setReplayData] = useState<StoryReplayData | null>(null);

  const isAdmin = isAdminEmail(user?.email);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const qs = new URLSearchParams();
      if (sideFilter) qs.set("side", sideFilter);
      if (stateFilter) qs.set("state", stateFilter);
      qs.set("limit", "200");
      const res = await fetch(`/api/admin/sr-audit?${qs}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setSummary(json.summary as SrAuditSummary);
      setEvents((json.events ?? []) as SrEventRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSummary(null);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user, sideFilter, stateFilter]);

  useEffect(() => {
    if (isAdmin) void fetchData();
  }, [isAdmin, fetchData]);

  const runBackfill = useCallback(async () => {
    if (!user) return;
    setBackfilling(true);
    setNotice("");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/sr-audit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "backfill", limit: 500 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Backfill failed");
      const s = json.summary;
      setNotice(
        `Backfill: ${s.enriched} enriched · ${s.winners} winners · ${s.snapshotted} snapshots · ${s.purged} purged (non-RR) · ${s.skippedNoCandles} out of candle window.`,
      );
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Backfill error");
    } finally {
      setBackfilling(false);
    }
  }, [user, fetchData]);

  const fetchStory = useCallback(
    async (id: string) => {
      if (!user) return null;
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/sr-audit/story?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load story");
      return json as {
        candidate: {
          symbol: string;
          label: string;
          side: "support" | "resistance";
          movePct: number;
          eventAt: string;
          pocHitAt: string | null;
        } | null;
        candles: StoryReplayData["candles"];
        levels: StoryReplayData["levels"];
      };
    },
    [user],
  );

  const openReplay = useCallback(
    async (row: SrEventRow) => {
      if (!row.id) return;
      setReplayOpen(true);
      setReplayLoading(true);
      setReplayData(null);
      try {
        const json = await fetchStory(row.id);
        if (json?.candidate) {
          setReplayData({
            symbol: json.candidate.symbol,
            label: json.candidate.label,
            side: json.candidate.side,
            movePct: json.candidate.movePct,
            eventAt: json.candidate.eventAt,
            pocHitAt: json.candidate.pocHitAt,
            candles: json.candles ?? [],
            levels: json.levels,
          });
        } else {
          setReplayData({
            symbol: row.symbol,
            label: row.label ?? row.symbol,
            side: row.side,
            movePct: row.maxFavorablePct ?? 0,
            eventAt: row.eventAt,
            pocHitAt: row.pocHitAt ?? null,
            candles: json?.candles ?? [],
            levels: json?.levels ?? null,
          });
        }
      } catch {
        setReplayData(null);
      } finally {
        setReplayLoading(false);
      }
    },
    [fetchStory],
  );

  const downloadStory = useCallback(
    async (row: SrEventRow) => {
      if (!row.id) return;
      try {
        const json = await fetchStory(row.id);
        const blob = new Blob([JSON.stringify(json, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `success-story-${row.symbol}-${row.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Story export failed");
      }
    },
    [fetchStory],
  );

  const filtered = useMemo(
    () => (winnersOnly ? events.filter((e) => e.reachedTarget === true) : events),
    [events, winnersOnly],
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="text-sm font-medium">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              SR Zone Audit
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5 max-w-2xl">
              In-zone support/resistance entries (stocks). Events stay open until invalidation or
              zone flip; outcomes scored hourly from Dhan klines.
            </p>
            {summary?.lastOutcomeCronAt ? (
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Last outcome cron{" "}
                {format(new Date(summary.lastOutcomeCronAt), "MMM d, yyyy HH:mm")}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runBackfill()}
              disabled={backfilling || loading}
              title="Re-score existing events + snapshot candles for winners (one-time, idempotent)"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-amber-400/30 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
            >
              <DatabaseZap className={`h-3.5 w-3.5 ${backfilling ? "animate-pulse" : ""}`} />
              {backfilling ? "Backfilling…" : "Backfill"}
            </button>
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-white/10 hover:bg-white/5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        ) : null}
        {notice ? (
          <p className="text-xs text-emerald-300/90 mb-4">{notice}</p>
        ) : null}

        {summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <StatCard title="Total events" value={String(summary.total)} sub={`${summary.open} open`} />
            <StatCard
              title="Support resolved"
              value={String(summary.support.resolved)}
              sub={`Inv ${pct(summary.support.invalidationRate)} · Flip ${pct(summary.support.zoneFlipRate)}`}
              tone="green"
            />
            <StatCard
              title="Support median MFE"
              value={pct(summary.support.medianMfePct)}
              sub={`MAE ${pct(summary.support.medianMaePct)}`}
              tone="green"
            />
            <StatCard
              title="Resistance resolved"
              value={String(summary.resistance.resolved)}
              sub={`Inv ${pct(summary.resistance.invalidationRate)} · Flip ${pct(summary.resistance.zoneFlipRate)}`}
              tone="red"
            />
            <StatCard
              title="Resistance median MFE"
              value={pct(summary.resistance.medianMfePct)}
              sub={`MAE ${pct(summary.resistance.medianMaePct)}`}
              tone="red"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 mb-4">
          {(["", "support", "resistance"] as const).map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => setSideFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                sideFilter === s
                  ? "border-blue-400/50 bg-blue-500/15 text-blue-200"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {s === "" ? "All sides" : s}
            </button>
          ))}
          {(["", "open", "resolved"] as const).map((s) => (
            <button
              key={s || "all-state"}
              type="button"
              onClick={() => setStateFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                stateFilter === s
                  ? "border-slate-300/40 bg-white/10 text-slate-200"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {s === "" ? "All states" : s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setWinnersOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border inline-flex items-center gap-1 ${
              winnersOnly
                ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                : "border-white/10 text-slate-400"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Success stories
          </button>
        </div>

        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Symbol</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Side</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Cluster</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Entered</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Max-pain hit</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Entry</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Max pain</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">MFE</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">MAE</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">POC</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Src</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Story</th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin inline-block" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                      {winnersOnly
                        ? "No success stories yet — they appear once an event reaches max pain with a ≥5% move."
                        : "No events yet — entries appear when stocks/indices newly enter in-zone support/resistance."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const isOpen = row.state === "open";
                    const isWinner = row.reachedTarget === true;
                    const isIndex = row.scope === "index";

                    return (
                      <tr
                        key={row.id ?? `${row.symbol}-${row.eventAt}`}
                        className="border-b border-white/5 hover:bg-white/[0.02]"
                        style={isWinner ? { background: "rgba(251,191,36,0.05)" } : undefined}
                      >
                        <td className="px-3 py-2 font-bold text-white whitespace-nowrap">
                          {row.symbol}
                          {isIndex ? (
                            <span className="ml-1.5 align-middle text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-sky-500/15 text-sky-300">
                              IDX
                            </span>
                          ) : null}
                          {isWinner ? (
                            <span className="ml-1.5 align-middle text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-400/15 text-amber-300">
                              Win
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex items-center gap-1 font-semibold uppercase"
                            style={{
                              color: row.side === "support" ? "#86efac" : "#fca5a5",
                            }}
                          >
                            {row.side === "support" ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {row.side}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {row.clusterStrike != null ? row.clusterStrike.toFixed(0) : "—"}
                          {row.clusterOi != null ? (
                            <span className="text-slate-500 text-[10px]">
                              {" "}
                              · {Intl.NumberFormat("en-IN", { notation: "compact" }).format(row.clusterOi)} OI
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-400 tabular-nums whitespace-nowrap">
                          {format(new Date(row.eventAt), "MMM d HH:mm")}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap text-amber-300/90">
                          {row.pocHitAt ? format(new Date(row.pocHitAt), "MMM d HH:mm") : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-300">
                          {row.entrySpot.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-amber-300/90">
                          {row.maxPain != null ? row.maxPain.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-emerald-400/90">
                          {pct(row.maxFavorablePct)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-red-400/90">
                          {pct(row.maxAdversePct)}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {row.hitPoc === true ? "Yes" : row.hitPoc === false ? "No" : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-300 uppercase text-[10px] font-semibold whitespace-nowrap">
                          {isOpen ? "open" : srCloseComment(row.resolveReason, row.closeComment)}
                        </td>
                        <td className="px-3 py-2 text-slate-500 uppercase text-[10px]">
                          {row.levelsSource ?? "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isWinner ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void openReplay(row)}
                                title="Replay the move"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10"
                              >
                                <PlayCircle className="h-3 w-3" />
                                Replay
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadStory(row)}
                                title="Download Remotion props for this story"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-amber-400/30 text-amber-200 hover:bg-amber-400/10"
                              >
                                <Download className="h-3 w-3" />
                                Story
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {replayOpen ? (
        <SrStoryReplay
          data={replayData}
          loading={replayLoading}
          onClose={() => setReplayOpen(false)}
        />
      ) : null}
    </div>
  );
}
