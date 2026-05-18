"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import { cn } from "@/lib/utils";
import { formatPrice, formatSignedUsd } from "@/lib/freedombot/trade-display";
import type {
  ExchangeMirrorSummary,
  LiveMirrorTrade,
} from "@/lib/admin/live-mirror-display";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Users } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const ADMIN_EMAIL = "hello@tezterminal.com";

export function useOpenTradesMirrors(simTradeIds: string[], enabled: boolean) {
  const { user } = useUser();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [mirrorsBySimTradeId, setMirrorsBySimTradeId] = useState<
    Record<string, LiveMirrorTrade[]>
  >({});
  const [exchangeSummary, setExchangeSummary] = useState<ExchangeMirrorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMirrors = useCallback(async () => {
    if (!user || !isAdmin || !enabled || simTradeIds.length === 0) {
      setMirrorsBySimTradeId({});
      setExchangeSummary([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const q = encodeURIComponent(simTradeIds.join(","));
      const res = await fetch(`/api/admin/sim-open-trades/mirrors?simTradeIds=${q}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMirrorsBySimTradeId(data.mirrorsBySimTradeId ?? {});
      setExchangeSummary(data.exchangeSummary ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load live mirrors");
      setMirrorsBySimTradeId({});
      setExchangeSummary([]);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, enabled, simTradeIds]);

  useEffect(() => {
    void fetchMirrors();
  }, [fetchMirrors]);

  return {
    isAdmin,
    mirrorsBySimTradeId,
    exchangeSummary,
    loading,
    error,
    refetch: fetchMirrors,
  };
}

/** Exchange pills + drill-down user/trade list (above open trades table). */
export function LiveMirrorExchangeBar({
  exchangeSummary,
  loading,
  error,
}: {
  exchangeSummary: ExchangeMirrorSummary[];
  loading: boolean;
  error: string | null;
}) {
  const [expandedExchange, setExpandedExchange] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
        Live mirrors: {error}
      </div>
    );
  }

  if (loading && exchangeSummary.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 px-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading live exchange mirrors…
      </div>
    );
  }

  if (exchangeSummary.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground/40 px-1">
        No live mirrored positions on exchanges for these open sim trades.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
          Live on exchange
        </span>
        {exchangeSummary.map((ex) => {
          const active = expandedExchange === ex.exchange;
          return (
            <button
              key={ex.exchange}
              type="button"
              onClick={() =>
                setExpandedExchange(active ? null : ex.exchange)
              }
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors",
                active
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {ex.exchange}
              <span className="font-mono text-emerald-400">{ex.count}</span>
            </button>
          );
        })}
      </div>

      {expandedExchange && (
        <ExchangeMirrorDrillDown
          summary={exchangeSummary.find((e) => e.exchange === expandedExchange)!}
        />
      )}
    </div>
  );
}

function ExchangeMirrorDrillDown({ summary }: { summary: ExchangeMirrorSummary }) {
  if (!summary) return null;
  return (
    <div className="border-t border-white/[0.06] pt-3 space-y-3">
      {summary.users.map((u) => (
        <div key={u.userId} className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-xs font-bold text-white">
              {u.displayName || u.email || u.userId}
            </span>
            {u.email && u.displayName && (
              <span className="text-[10px] text-muted-foreground/50">{u.email}</span>
            )}
            {u.deploymentId && (
              <Link
                href={`/admin/bot-users/${u.deploymentId}`}
                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase text-accent hover:underline"
              >
                Bot detail <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-white/[0.05]">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-left text-muted-foreground/50 uppercase tracking-wider border-b border-white/[0.05]">
                  <th className="px-2 py-1.5 font-bold">Symbol</th>
                  <th className="px-2 py-1.5 font-bold">Side</th>
                  <th className="px-2 py-1.5 font-bold">Entry</th>
                  <th className="px-2 py-1.5 font-bold">Current</th>
                  <th className="px-2 py-1.5 font-bold">uPnL</th>
                  <th className="px-2 py-1.5 font-bold">Size</th>
                  <th className="px-2 py-1.5 font-bold">Lev</th>
                  <th className="px-2 py-1.5 font-bold text-right">Opened</th>
                </tr>
              </thead>
              <tbody>
                {u.trades.map((t) => (
                  <MirrorTradeMiniRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function MirrorTradeMiniRow({ trade }: { trade: LiveMirrorTrade }) {
  const pnl = trade.status === "open" ? trade.unrealizedPnl : trade.realizedPnl;
  const pnlColor = pnl >= 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <tr className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
      <td className="px-2 py-1.5 font-mono font-bold text-white">{trade.symbol}</td>
      <td className="px-2 py-1.5">
        <span
          className={cn(
            "font-bold uppercase",
            trade.side === "LONG" ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {trade.side}
        </span>
      </td>
      <td className="px-2 py-1.5 font-mono">${formatPrice(trade.entryPrice)}</td>
      <td className="px-2 py-1.5 font-mono">${formatPrice(trade.currentPrice)}</td>
      <td className={cn("px-2 py-1.5 font-mono font-bold", pnlColor)}>
        {formatSignedUsd(pnl)}
      </td>
      <td className="px-2 py-1.5 font-mono">
        {trade.positionSize != null ? `$${trade.positionSize.toFixed(2)}` : "—"}
      </td>
      <td className="px-2 py-1.5 font-mono">{trade.leverage}x</td>
      <td className="px-2 py-1.5 text-right text-muted-foreground/60">
        {trade.openedAt ? format(new Date(trade.openedAt), "MMM d HH:mm") : "—"}
      </td>
    </tr>
  );
}

/** Second row under a sim trade — live mirrors for that position. */
export function SimTradeMirrorSubRow({
  mirrors,
  expanded,
  onToggle,
  colSpan,
}: {
  mirrors: LiveMirrorTrade[];
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  if (mirrors.length === 0) return null;

  return (
    <>
      <TableRow className="border-white/5 bg-white/[0.01] hover:bg-white/[0.01]">
        <TableCell colSpan={colSpan} className="py-1 px-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-accent/80 hover:text-accent"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {mirrors.length} live mirror{mirrors.length !== 1 ? "s" : ""} on exchange
          </button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="border-white/5 bg-black/20 hover:bg-black/20">
          <TableCell colSpan={colSpan} className="p-0">
            <div className="px-3 py-2 space-y-2">
              {mirrors.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] border-b border-white/[0.04] last:border-0 pb-2 last:pb-0"
                >
                  <span className="font-bold text-white min-w-[120px]">
                    {m.displayName || m.email || m.userId}
                  </span>
                  <span className="font-mono text-accent/80 uppercase">{m.exchange}</span>
                  <span className="font-mono text-white/70">{m.symbol}</span>
                  <span
                    className={cn(
                      "font-bold uppercase",
                      m.side === "LONG" ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {m.side}
                  </span>
                  <span className="text-muted-foreground/50">
                    Entry ${formatPrice(m.entryPrice)}
                  </span>
                  <span className="text-muted-foreground/50">
                    Now ${formatPrice(m.currentPrice)}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      m.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {formatSignedUsd(m.unrealizedPnl)}
                  </span>
                  <span className="text-muted-foreground/50">
                    {m.positionSize != null ? `$${m.positionSize.toFixed(0)}` : "—"} · {m.leverage}x
                  </span>
                  {m.deploymentId && (
                    <Link
                      href={`/admin/bot-users/${m.deploymentId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      View user <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
