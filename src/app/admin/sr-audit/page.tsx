"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SrStoryReplay, type StoryReplayData } from "@/components/admin/SrStoryReplay";
import { SrStoryPublish } from "@/components/admin/SrStoryPublish";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { srEventDisplayStatus, srEventOutcome } from "@/lib/sr-audit/pnl";
import { scoreDirectionalSetup } from "@/lib/levels/strategy-score";
import { scoreInputsFromSrEvent } from "@/lib/levels/strategy-score-adapters";
import type { SrAuditSummary, SrZoneEvent } from "@/lib/sr-audit/types";
import type { SuccessStoryCandidate } from "@/lib/videos/success-story";
import { format } from "date-fns";
import {
  Activity,
  CheckCircle2,
  DatabaseZap,
  Download,
  Loader2,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SrEventRow = SrZoneEvent & { id?: string };

interface PostedInfo {
  at: string;
  status: "ok" | "partial" | "failed";
  platforms: string[];
}

interface StoryFetchResponse {
  candidate: SuccessStoryCandidate | null;
  candles: StoryReplayData["candles"];
  levels: {
    side: "support" | "resistance";
    entrySpot: number;
    maxPain: number | null;
    invalidation: number | null;
    clusterStrike: number | null;
    putClusterStrike: number | null;
    putClusterSize: number | null;
    callClusterStrike: number | null;
    callClusterSize: number | null;
    bullZoneLow: number | null;
    bullZoneHigh: number | null;
    bearZoneLow: number | null;
    bearZoneHigh: number | null;
  } | null;
  hasSnapshot: boolean;
}

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/**
 * Composite setup score for a recorded event, using the SAME engine Atlas uses
 * live — scored from the levels captured at entry. This is the calibration
 * bridge: does a higher setup score line up with a better realised outcome?
 */
function eventScore(row: SrZoneEvent): number {
  return scoreDirectionalSetup(row.side, scoreInputsFromSrEvent(row), {
    riskReward: row.entryRr ?? null,
  }).composite;
}

function scoreColor(v: number): string {
  if (v >= 70) return "#86efac";
  if (v >= 50) return "#fcd34d";
  return "#fca5a5";
}

/** Compact PVT level, matching the trend chart's M/K formatting. */
function fmtPvtLevel(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/** One labelled PVT level (e.g. "entry 1.2M"), optionally coloured by direction. */
function PvtChip({
  label,
  value,
  color = "#cbd5e1",
}: {
  label: string;
  value: number | null | undefined;
  color?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[9px] uppercase text-slate-500">{label}</span>
      <span className="font-mono tabular-nums text-[11px] font-bold" style={{ color }}>
        {fmtPvtLevel(value)}
      </span>
    </span>
  );
}

/**
 * PVT lifecycle cell showing the real chart PVT levels: the dip-day value plus
 * the state's second anchor — now (open) or exit (resolved). The second value is
 * coloured green when PVT rose since the dip (accumulation → bullish) and red
 * when it fell (distribution → bearish).
 */
function PvtCell({ row, outcome }: { row: SrZoneEvent; outcome: string }) {
  const resolved = outcome === "win" || outcome === "loss";
  const second = resolved ? row.exitPvt : row.currentPvt;
  const entry = row.entryPvt;
  let color = "#cbd5e1";
  if (entry != null && second != null && Number.isFinite(entry) && Number.isFinite(second)) {
    color = second > entry ? "#86efac" : second < entry ? "#fca5a5" : "#cbd5e1";
  }
  return (
    <div className="flex flex-col gap-0.5">
      <PvtChip label="entry" value={entry} />
      <PvtChip label={resolved ? "exit" : "now"} value={second} color={color} />
    </div>
  );
}

const SCORE_BUCKETS = [
  { label: "0–49", min: 0, max: 49 },
  { label: "50–69", min: 50, max: 69 },
  { label: "70–100", min: 70, max: 100 },
] as const;

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
  const [outcomeFilter, setOutcomeFilter] = useState<"" | "win" | "loss" | "open">("");
  const [backfilling, setBackfilling] = useState(false);
  const [notice, setNotice] = useState("");
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayData, setReplayData] = useState<StoryReplayData | null>(null);
  const [publishRow, setPublishRow] = useState<SrEventRow | null>(null);
  const [posted, setPosted] = useState<Record<string, PostedInfo>>({});

  const isAdmin = isAdminEmail(user?.email);

  /** Bearer-authed fetch for the publish modal (render + captions + schedule). */
  const authedFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const idToken = await user!.getIdToken();
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${idToken}`);
      return fetch(input, { ...init, headers });
    },
    [user],
  );

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const qs = new URLSearchParams();
      qs.set("limit", "500");
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
  }, [user]);

  const fetchPosted = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch(`/api/admin/social/posted?source=sr-audit`);
      const json = await res.json();
      if (res.ok && json.posted) setPosted(json.posted as Record<string, PostedInfo>);
    } catch {
      /* non-fatal — the badge is informational */
    }
  }, [user, authedFetch]);

  useEffect(() => {
    if (isAdmin) {
      void fetchData();
      void fetchPosted();
    }
  }, [isAdmin, fetchData, fetchPosted]);

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
      return json as StoryFetchResponse;
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
        const c = json?.candidate;
        const lv = json?.levels;
        setReplayData({
          symbol: c?.symbol ?? row.symbol,
          label: c?.label ?? row.label ?? row.symbol,
          scope: c?.scope ?? (row.scope === "index" ? "index" : "stock"),
          side: c?.side ?? row.side,
          entrySpot: c?.entrySpot ?? lv?.entrySpot ?? row.entrySpot ?? 0,
          maxPain: c?.maxPain ?? lv?.maxPain ?? row.maxPain ?? null,
          invalidation: c?.invalidation ?? lv?.invalidation ?? null,
          putClusterStrike: c?.putClusterStrike ?? lv?.putClusterStrike ?? null,
          putClusterSize: c?.putClusterSize ?? lv?.putClusterSize ?? null,
          callClusterStrike: c?.callClusterStrike ?? lv?.callClusterStrike ?? null,
          callClusterSize: c?.callClusterSize ?? lv?.callClusterSize ?? null,
          bullZoneLow: lv?.bullZoneLow ?? null,
          bullZoneHigh: lv?.bullZoneHigh ?? null,
          bearZoneLow: lv?.bearZoneLow ?? null,
          bearZoneHigh: lv?.bearZoneHigh ?? null,
          zonesExpiry: c?.zonesExpiry ?? null,
          atmIV: c?.atmIV ?? null,
          entryRr: c?.entryRr ?? null,
          movePct: c?.movePct ?? row.maxFavorablePct ?? 0,
          maxPainDistancePct: c?.maxPainDistancePct ?? 0,
          eventAt: c?.eventAt ?? row.eventAt,
          pocHitAt: c?.pocHitAt ?? row.pocHitAt ?? null,
          resolvedAt: c?.resolvedAt ?? row.resolvedAt ?? null,
          resolveReason: c?.resolveReason ?? row.resolveReason ?? null,
          finalPnlPct: c?.finalPnlPct ?? row.finalPnlPct ?? null,
          candles: json?.candles ?? [],
        });
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

  const filterCounts = useMemo(() => {
    const forSideCounts = outcomeFilter
      ? events.filter((e) => srEventOutcome(e) === outcomeFilter)
      : events;
    const forOutcomeCounts = sideFilter
      ? events.filter((e) => e.side === sideFilter)
      : events;

    return {
      side: {
        "": forSideCounts.length,
        support: forSideCounts.filter((e) => e.side === "support").length,
        resistance: forSideCounts.filter((e) => e.side === "resistance").length,
      },
      outcome: {
        "": forOutcomeCounts.length,
        win: forOutcomeCounts.filter((e) => srEventOutcome(e) === "win").length,
        loss: forOutcomeCounts.filter((e) => srEventOutcome(e) === "loss").length,
        open: forOutcomeCounts.filter((e) => srEventOutcome(e) === "open").length,
      },
    };
  }, [events, sideFilter, outcomeFilter]);

  const filtered = useMemo(() => {
    let rows = events;
    if (sideFilter) rows = rows.filter((e) => e.side === sideFilter);
    if (outcomeFilter) rows = rows.filter((e) => srEventOutcome(e) === outcomeFilter);
    return rows;
  }, [events, sideFilter, outcomeFilter]);

  /** Score-vs-outcome calibration over the filtered, resolved (win/loss) events. */
  const calibration = useMemo(() => {
    const buckets = SCORE_BUCKETS.map((b) => ({ ...b, win: 0, loss: 0 }));
    for (const e of filtered) {
      const outcome = srEventOutcome(e);
      if (outcome !== "win" && outcome !== "loss") continue;
      const sc = eventScore(e);
      const bucket = buckets.find((b) => sc >= b.min && sc <= b.max);
      if (!bucket) continue;
      if (outcome === "win") bucket.win += 1;
      else bucket.loss += 1;
    }
    return buckets.map((b) => {
      const total = b.win + b.loss;
      return { ...b, total, winRate: total > 0 ? (b.win / total) * 100 : null };
    });
  }, [filtered]);

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
      <main className="max-w-[min(1720px,98vw)] mx-auto px-3 sm:px-4 pt-6 pb-16">
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
              onClick={() => {
                void fetchData();
                void fetchPosted();
              }}
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

        <div
          className="rounded-xl border p-4 mb-6"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.6)" }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Setup score → outcome calibration
            </p>
            <p className="text-[10px] text-slate-500">
              Win rate by Atlas score bucket (resolved events in view)
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {calibration.map((b) => (
              <div
                key={b.label}
                className="rounded-lg p-3 border"
                style={{ borderColor: `${scoreColor(b.max)}33`, background: "rgba(2,6,23,0.5)" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: scoreColor(b.max) }}>
                  Score {b.label}
                </p>
                <p className="text-2xl font-black tabular-nums mt-1" style={{ color: scoreColor(b.max) }}>
                  {b.winRate == null ? "—" : `${b.winRate.toFixed(0)}%`}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {b.total > 0 ? `${b.win}W / ${b.loss}L · ${b.total} resolved` : "no resolved events"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-3">
            A well-calibrated score should show win rate rising left → right. Scores here use levels,
            max-pain sign, IV regime, R:R and the backfilled entry PVT (first sessions after the dip);
            news / IV-percentile aren&apos;t captured on historical rows.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["", "All sides"],
              ["support", "Support"],
              ["resistance", "Resistance"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all-sides"}
              type="button"
              onClick={() => setSideFilter(value)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                sideFilter === value
                  ? "border-blue-400/50 bg-blue-500/15 text-blue-200"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {label} ({filterCounts.side[value]})
            </button>
          ))}
          {(
            [
              ["", "All"],
              ["win", "Win"],
              ["loss", "Loss"],
              ["open", "Open"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all-outcomes"}
              type="button"
              onClick={() => setOutcomeFilter(value)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                outcomeFilter === value
                  ? value === "win"
                    ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                    : value === "loss"
                      ? "border-red-400/40 bg-red-500/10 text-red-200"
                      : value === "open"
                        ? "border-slate-300/40 bg-white/10 text-slate-200"
                        : "border-slate-300/40 bg-white/10 text-slate-200"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {label} ({filterCounts.outcome[value]})
            </button>
          ))}
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
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">Score</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500">PVT</th>
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
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500 min-w-[22rem] w-[22rem]">
                    Story
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin inline-block" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-slate-500">
                      {outcomeFilter === "win"
                        ? "No wins yet — they appear once an event reaches max pain or closes on zone flip."
                        : outcomeFilter === "loss"
                          ? "No losses in this view — losses close when the entry zone is invalidated."
                          : outcomeFilter === "open"
                            ? "No open events in this view — these are still tracking (neither win nor loss yet)."
                            : "No events yet — entries appear when stocks/indices newly enter in-zone support/resistance."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const status = srEventDisplayStatus(row);
                    const isWinner = status.outcome === "win";
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
                        <td className="px-3 py-2">
                          {(() => {
                            const sc = eventScore(row);
                            return (
                              <span
                                className="inline-flex items-center justify-center h-6 min-w-[1.75rem] px-1.5 rounded-md text-[11px] font-black tabular-nums"
                                style={{
                                  color: scoreColor(sc),
                                  backgroundColor: `${scoreColor(sc)}1f`,
                                  border: `1px solid ${scoreColor(sc)}44`,
                                }}
                                title={`Atlas setup score at entry: ${sc}/100`}
                              >
                                {sc}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <PvtCell row={row} outcome={status.outcome} />
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
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className="text-[11px] font-bold uppercase"
                            style={{
                              color:
                                status.outcome === "win"
                                  ? "#fbbf24"
                                  : status.outcome === "loss"
                                    ? "#f87171"
                                    : "#94a3b8",
                            }}
                          >
                            {status.title}
                          </span>
                          {status.subtitle ? (
                            <span className="block text-[10px] text-slate-500 normal-case font-medium">
                              {status.subtitle}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-500 uppercase text-[10px]">
                          {row.levelsSource ?? "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap min-w-[22rem] w-[22rem]">
                          {isWinner ? (
                            <div className="flex flex-nowrap items-center gap-1.5">
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
                              <button
                                type="button"
                                onClick={() => setPublishRow(row)}
                                title="Render the reel + schedule it to Buffer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-violet-400/30 text-violet-200 hover:bg-violet-400/10"
                              >
                                <Send className="h-3 w-3" />
                                {row.id && posted[row.id] ? "Re-post" : "Post"}
                              </button>
                              {row.id && posted[row.id] ? (
                                <span
                                  title={`Posted ${format(new Date(posted[row.id]!.at), "MMM d, HH:mm")} · ${posted[row.id]!.platforms.join(", ")}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Posted
                                </span>
                              ) : null}
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

      {publishRow?.id ? (
        <SrStoryPublish
          authedFetch={authedFetch}
          story={{ id: publishRow.id, symbol: publishRow.symbol, label: publishRow.label || publishRow.symbol }}
          onClose={() => {
            setPublishRow(null);
            void fetchPosted();
          }}
        />
      ) : null}
    </div>
  );
}
